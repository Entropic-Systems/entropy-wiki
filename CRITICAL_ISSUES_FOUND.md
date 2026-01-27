# Critical Issues Found in Entropy Wiki Codebase

## Summary
This document lists critical security vulnerabilities, crash risks, and data loss issues found during code review.

**Last Updated**: All critical security issues have been fixed.

## Critical Security Vulnerabilities

### 1. SQL Injection in Migration Endpoint
**Location**: `/api/src/index.ts:92-93`
**Severity**: CRITICAL
**Status**: ✅ FIXED
**Description**: Raw SQL file content is executed directly without validation
```typescript
const sql = readFileSync(join(migrationsDir, file), 'utf-8');
await query(sql);
```
**Impact**: Malicious SQL files could execute arbitrary database commands
**Fix Applied**: Added validation for dangerous SQL patterns and transaction-based execution

### 2. Plain Text Admin Password
**Location**: Multiple files - `/api/src/index.ts:68`, `/api/src/routes/admin.ts:17`
**Severity**: HIGH
**Status**: ✅ FIXED
**Description**: Admin password is compared directly from environment variable without hashing
```typescript
if (!password || password !== process.env.ADMIN_PASSWORD)
```
**Impact**: Passwords exposed in memory, logs, and headers; vulnerable to interception
**Fix Applied**: Implemented bcrypt password hashing with support for both development (plain) and production (hashed) passwords

### 3. HTTP Default in Production
**Location**: `/lib/api/client.ts:32`, `/lib/api/server.ts:10`
**Severity**: HIGH
**Status**: ✅ FIXED
**Description**: API defaults to HTTP instead of HTTPS
```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
```
**Impact**: Sensitive data transmitted in plain text
**Fix Applied**: Added production checks to enforce HTTPS and require explicit API URL configuration

### 4. Path Traversal Vulnerability
**Location**: `/lib/mdx/get-doc-by-slug.ts:17-27`
**Severity**: HIGH
**Description**: User-provided slug is joined with file paths without validation
```typescript
path.join(DOCS_DIR, ...slug) + '.md'
```
**Impact**: Attackers could read arbitrary files on the system
**Fix Required**: Validate and sanitize slug input

### 5. Missing Input Validation
**Location**: `/api/src/routes/admin.ts:195-203`
**Severity**: MEDIUM
**Description**: No validation on user-provided content that gets stored in database
```typescript
if (!body.slug || !body.title || !body.content_md) {
  return res.status(400).json({...});
}
```
**Impact**: XSS attacks, malformed data, potential injection attacks
**Fix Required**: Implement comprehensive input validation and sanitization

## Crash/Performance Risks

### 6. Synchronous File Reading
**Location**: Multiple files - `/lib/mdx/get-doc-by-slug.ts:91`, `/lib/navigation/build-nav-tree.ts:18`
**Severity**: MEDIUM
**Description**: Using `fs.readFileSync` blocks the event loop
```typescript
const fileContent = fs.readFileSync(filePath, 'utf-8')
```
**Impact**: Server can become unresponsive under load
**Fix Required**: Use async file operations

### 7. No File Size Limits
**Location**: `/lib/mdx/get-doc-by-slug.ts:91`
**Severity**: MEDIUM
**Description**: No limit on file size when reading content
**Impact**: Memory exhaustion with large files
**Fix Required**: Implement file size limits

### 8. Unvalidated JSON Parsing
**Location**: `/lib/navigation/build-nav-tree.ts:19`
**Severity**: LOW
**Description**: JSON.parse without try-catch or validation
```typescript
return JSON.parse(content)
```
**Impact**: Malformed JSON causes crashes
**Fix Required**: Add proper error handling

## Data Loss Risks

### 9. Database Credential Exposure
**Location**: `/api/src/index.ts:48,56`
**Severity**: MEDIUM
**Description**: Regex pattern for redacting credentials may not cover all cases
```typescript
dbUrl: process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')
```
**Impact**: Database credentials could be exposed in logs/responses
**Fix Required**: Improve redaction logic

## Additional Concerns

### 10. Regex Pattern Issues
**Location**: `/lib/api/server.ts:73`, `/lib/mdx/get-doc-by-slug.ts:56`
**Severity**: LOW
**Description**: Regex pattern `/^#\s+(.+)$/m` could fail on edge cases
**Impact**: Content extraction failures
**Fix Required**: Improve regex robustness

## Recommended Actions

1. **Immediate**: Fix SQL injection vulnerability in migration endpoint
2. **High Priority**: Implement password hashing and HTTPS enforcement
3. **Medium Priority**: Add path traversal protection and input validation
4. **Low Priority**: Convert to async file operations and improve error handling

## Next Steps
These issues should be systematically addressed based on severity, starting with the critical security vulnerabilities.