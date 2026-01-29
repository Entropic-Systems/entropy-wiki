#!/bin/bash
# Hook: Enhanced Validation for Bead Workflow
#
# This hook provides validation at key workflow points:
# 1. When starting work (bd update --status=in_progress) - plan validation
# 2. When closing (bd close) - verify validation and check CI gates
#
# CI Gate Checks (fail-open design):
# - GitHub Actions workflow status
# - Railway deployment health (via API)
# - Vercel build status
#
# Exit codes:
#   0 = success (continue with command)
#   2 = blocking error (would prevent command)
#
# Bead: entropy-wiki-2gl

set -euo pipefail

# Read the JSON input from stdin
INPUT=$(cat)

# Extract the command using Python (more portable than jq)
COMMAND=$(echo "$INPUT" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('tool_input', {}).get('command', ''))" 2>/dev/null || echo "")

# Configuration
CI_GATE_ENABLED="${CI_GATE_ENABLED:-true}"
CI_GATE_TIMEOUT="${CI_GATE_TIMEOUT:-5}"
API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
GITHUB_REPO="${GITHUB_REPO:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper function for colored output
print_status() {
  local color="$1"
  local status="$2"
  local message="$3"
  echo -e "${color}[${status}]${NC} ${message}" >&2
}

# Check GitHub Actions status (fail-open)
check_github_actions() {
  if [ -z "$GITHUB_REPO" ]; then
    print_status "$YELLOW" "SKIP" "GitHub Actions: GITHUB_REPO not configured"
    return 0
  fi

  # Try to get workflow status via gh CLI
  if ! command -v gh &> /dev/null; then
    print_status "$YELLOW" "SKIP" "GitHub Actions: gh CLI not available"
    return 0
  fi

  local status
  status=$(timeout "$CI_GATE_TIMEOUT" gh run list --repo "$GITHUB_REPO" --limit 1 --json conclusion --jq '.[0].conclusion' 2>/dev/null || echo "unknown")

  case "$status" in
    "success")
      print_status "$GREEN" "PASS" "GitHub Actions: Latest workflow succeeded"
      ;;
    "failure")
      print_status "$RED" "WARN" "GitHub Actions: Latest workflow FAILED - consider investigating"
      ;;
    "in_progress"|"queued"|"pending")
      print_status "$YELLOW" "WARN" "GitHub Actions: Workflow in progress"
      ;;
    *)
      print_status "$YELLOW" "SKIP" "GitHub Actions: Unable to check status"
      ;;
  esac
  return 0
}

# Check API health (fail-open)
check_api_health() {
  local health_url="${API_BASE_URL}/health"

  local response
  response=$(timeout "$CI_GATE_TIMEOUT" curl -s -w "\n%{http_code}" "$health_url" 2>/dev/null || echo -e "\n000")

  local http_code
  http_code=$(echo "$response" | tail -n1)
  local body
  body=$(echo "$response" | head -n-1)

  case "$http_code" in
    "200")
      print_status "$GREEN" "PASS" "API Health: Service responding normally"
      ;;
    "000")
      print_status "$YELLOW" "SKIP" "API Health: Could not connect to ${health_url}"
      ;;
    *)
      print_status "$YELLOW" "WARN" "API Health: Unexpected status $http_code"
      ;;
  esac
  return 0
}

# Check database health (fail-open)
check_db_health() {
  local health_url="${API_BASE_URL}/health/db"

  local response
  response=$(timeout "$CI_GATE_TIMEOUT" curl -s "$health_url" 2>/dev/null || echo '{}')

  local db_status
  db_status=$(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('database', 'unknown'))" 2>/dev/null || echo "unknown")

  case "$db_status" in
    "connected")
      print_status "$GREEN" "PASS" "Database: Connected and healthy"
      ;;
    "disconnected")
      print_status "$RED" "WARN" "Database: DISCONNECTED - deployment may fail"
      ;;
    *)
      print_status "$YELLOW" "SKIP" "Database: Unable to check status"
      ;;
  esac
  return 0
}

# Check for recent debug bundle artifacts
check_debug_bundle() {
  if [ ! -d ".github/workflows" ]; then
    return 0
  fi

  # Check if debug bundle workflow exists
  if [ -f ".github/workflows/debug-bundle.yml" ]; then
    print_status "$BLUE" "INFO" "Debug Bundle: Workflow configured"
  fi
  return 0
}

# Run all CI gate checks
run_ci_gate_checks() {
  echo -e "\n${BLUE}=== CI GATE CHECKS ===${NC}" >&2

  check_github_actions
  check_api_health
  check_db_health
  check_debug_bundle

  echo -e "${BLUE}======================${NC}\n" >&2
}

# Reminder when starting work on a bead
if [[ "$COMMAND" == *"bd update"* ]] && [[ "$COMMAND" == *"in_progress"* ]]; then
  cat >&2 << 'EOF'
=== STARTING WORK ===
Plan your validation approach now:
  1. What defines "done" for this bead?
  2. What tests will verify success?
  3. What commands will validate?

Entropy-wiki validation commands:
  - npm run build        (always required)
  - cd api && npm test   (API changes)
  - npx playwright test  (frontend E2E)
  - Manual smoke test    (UI changes)
=====================
EOF
fi

# Enhanced validation before closing a bead
if [[ "$COMMAND" == *"bd close"* ]]; then
  cat >&2 << 'EOF'
=== VALIDATION REMINDER ===
Before closing this bead, confirm:
  [ ] validation-before-close skill was invoked
  [ ] Build passes: npm run build
  [ ] Tests pass: cd api && npm test
  [ ] Changes work as expected
  [ ] No regressions introduced
===========================
EOF

  # Run CI gate checks if enabled
  if [ "$CI_GATE_ENABLED" = "true" ]; then
    run_ci_gate_checks
  fi
fi

# Always exit 0 - fail-open design
# We provide information but don't block the user
exit 0
