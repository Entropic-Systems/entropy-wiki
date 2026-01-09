# Playwright Plugin

Browser automation for visual testing, functional validation, and layout debugging via Model Context Protocol (MCP) integration.

## Overview

The Playwright plugin provides a complete browser automation toolkit through MCP, enabling:
- **Visual regression testing** - Screenshot comparisons before/after changes
- **Functional validation** - Verify user interactions and flows
- **Layout debugging** - Inspect CSS, DOM structure, and rendering issues
- **Responsive testing** - Test across different viewport sizes
- **Accessibility checks** - Validate ARIA attributes and semantics

## Installation & Setup

### 1. Configure MCP Server

Add to `.mcp.json` in project root:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp"]
    }
  }
}
```

### 2. Restart Claude Code

The MCP server loads on startup. Restart to activate Playwright tools.

### 3. Verify Installation

Check that Playwright tools are available:
- `browser_navigate` - Navigate to URL
- `browser_snapshot` - Capture accessibility snapshot
- `browser_take_screenshot` - Take screenshots
- `browser_click` - Click elements
- `browser_evaluate` - Run JavaScript in page context

## Available Tools

### Navigation
- `browser_navigate(url)` - Load a page
- `browser_navigate_back()` - Go back in history
- `browser_tabs(action)` - Manage browser tabs

### Inspection
- `browser_snapshot()` - Accessibility tree snapshot (better than screenshot for actions)
- `browser_take_screenshot(options)` - Visual screenshot (PNG/JPEG)
- `browser_console_messages(level)` - Get console output
- `browser_network_requests()` - View network activity

### Interaction
- `browser_click(element, ref)` - Click elements
- `browser_type(element, ref, text)` - Type text
- `browser_hover(element, ref)` - Hover over elements
- `browser_fill_form(fields)` - Fill multiple form fields
- `browser_drag(startRef, endRef)` - Drag and drop

### Evaluation
- `browser_evaluate(function)` - Execute JavaScript
- `browser_run_code(code)` - Run Playwright code snippet
- `browser_wait_for(options)` - Wait for text/time

### Configuration
- `browser_resize(width, height)` - Change viewport size
- `browser_handle_dialog(accept)` - Handle alerts/confirms
- `browser_file_upload(paths)` - Upload files

## Usage Patterns

### Pattern 1: Debug Layout Issues

When content appears misaligned or constrained:

```javascript
// 1. Navigate to problematic page
browser_navigate("http://localhost:3000/page")

// 2. Take screenshot of current state
browser_take_screenshot({ fullPage: true })

// 3. Inspect element dimensions and styles
browser_evaluate(`
  const main = document.querySelector('main');
  return {
    width: main.offsetWidth,
    maxWidth: getComputedStyle(main).maxWidth,
    classes: main.className,
    parentStyles: getComputedStyle(main.parentElement).gridTemplateColumns
  }
`)

// 4. Identify constraining CSS
// Result shows: max-w-4xl limiting content to 896px

// 5. Fix in code and re-validate
```

### Pattern 2: Visual Regression Testing

Validate UI changes don't break existing layouts:

```javascript
// Baseline screenshot before changes
browser_navigate("http://localhost:3000")
browser_take_screenshot({ filename: "baseline.png" })

// Make changes, rebuild
// ...

// Compare with new screenshot
browser_take_screenshot({ filename: "current.png" })

// Manual or automated comparison
```

### Pattern 3: Functional Testing

Verify user interactions work correctly:

```javascript
// Test form submission
browser_navigate("http://localhost:3000/login")

browser_fill_form([
  { name: "email", type: "textbox", ref: "email-input", value: "user@example.com" },
  { name: "password", type: "textbox", ref: "password-input", value: "password123" }
])

browser_click({ element: "submit button", ref: "submit-btn" })

// Verify redirect
browser_evaluate(`window.location.pathname`)
// Expected: "/dashboard"
```

### Pattern 4: Responsive Testing

Test layouts across viewport sizes:

```javascript
// Mobile (375x667)
browser_resize({ width: 375, height: 667 })
browser_navigate("http://localhost:3000")
browser_take_screenshot({ filename: "mobile.png" })

// Tablet (768x1024)
browser_resize({ width: 768, height: 1024 })
browser_take_screenshot({ filename: "tablet.png" })

// Desktop (1920x1080)
browser_resize({ width: 1920, height: 1080 })
browser_take_screenshot({ filename: "desktop.png" })
```

## Integration with Skills

### playwright-testing Skill

The Playwright plugin is primarily used through the `playwright-testing` skill, which provides:
- Structured testing patterns
- Integration with `validation-before-close`
- Repository-specific test flows
- Best practices and checklists

```bash
# Skill automatically invoked for frontend validation
/validation-before-close
  ↓
Detects frontend changes
  ↓
Invokes playwright-testing skill
  ↓
Runs visual and functional tests
```

### Standalone Usage

You can also use Playwright tools directly without the skill:

```javascript
// Quick layout check
browser_navigate("http://localhost:3000/new-page")
browser_take_screenshot({ fullPage: true })

// Console error check
browser_console_messages({ level: "error" })

// Network debugging
browser_network_requests({ includeStatic: false })
```

## Common Use Cases

### 1. Pre-deployment Validation
Ensure pages render correctly before pushing:
- Navigate to all key pages
- Take screenshots for review
- Check console for errors
- Verify network requests succeed

### 2. Bug Investigation
Debug reported UI issues:
- Reproduce the issue in browser
- Inspect element styles and dimensions
- Check JavaScript errors
- Identify root cause

### 3. Feature Development
Validate new features work end-to-end:
- Test user flows
- Verify state changes
- Check responsive behavior
- Ensure accessibility

### 4. Continuous Validation
Use in ralph-loop workflows:
- Implement feature
- Run Playwright tests
- See failures
- Fix and re-test
- Repeat until passing

## Best Practices

### Do
- ✅ Always start dev server before testing
- ✅ Use `browser_snapshot` for inspecting page structure
- ✅ Take screenshots at key states for documentation
- ✅ Test both light and dark themes
- ✅ Check console messages after every navigation
- ✅ Test responsive behavior on multiple viewports
- ✅ Clean up screenshot files after validation

### Don't
- ❌ Skip dev server startup check
- ❌ Rely solely on screenshots for debugging (use evaluate)
- ❌ Test only desktop viewport
- ❌ Ignore console warnings
- ❌ Leave screenshot files in project root
- ❌ Test without rebuilding after changes

## Troubleshooting

### MCP Server Not Available
**Symptom**: Playwright tools not showing in Claude Code

**Solution**:
1. Verify `.mcp.json` exists with correct configuration
2. Restart Claude Code to reload MCP servers
3. Check that `npx` is available: `which npx`

### Browser Timeouts
**Symptom**: Navigation or clicks timeout

**Solution**:
1. Ensure dev server is running and responsive
2. Check if page actually loads in regular browser
3. Use `browser_wait_for` to wait for specific elements
4. Increase timeout in tool calls

### Screenshots Not Saving
**Symptom**: Screenshot commands succeed but files not found

**Solution**:
1. Use absolute paths: `/tmp/screenshot.png`
2. Check directory permissions
3. Verify file was created: `ls -la /tmp/*.png`

## Advanced Techniques

### Element State Debugging
```javascript
// Get computed styles for entire tree
browser_evaluate(`
  const el = document.querySelector('main');
  const styles = getComputedStyle(el);
  const parent = getComputedStyle(el.parentElement);
  return {
    element: {
      display: styles.display,
      width: styles.width,
      maxWidth: styles.maxWidth,
      flex: styles.flex
    },
    parent: {
      display: parent.display,
      gridTemplateColumns: parent.gridTemplateColumns,
      flexDirection: parent.flexDirection
    }
  }
`)
```

### Network Performance Analysis
```javascript
// Get all failed or slow requests
browser_network_requests({ includeStatic: false })

// Analyze in JavaScript
browser_evaluate(`
  performance.getEntriesByType('navigation')[0].toJSON()
`)
```

### Accessibility Validation
```javascript
// Check ARIA attributes
browser_evaluate(`
  const buttons = document.querySelectorAll('button');
  return Array.from(buttons).map(btn => ({
    text: btn.textContent,
    ariaLabel: btn.getAttribute('aria-label'),
    role: btn.getAttribute('role')
  }))
`)
```

## Related Documentation

- [playwright-testing Skill](../.claude/skills/playwright-testing/SKILL.md) - Structured testing patterns
- [validation-before-close Skill](../.claude/skills/validation-before-close/SKILL.md) - Integration with validation workflow
- [Playwright MCP Official Docs](https://github.com/microsoft/playwright-mcp) - MCP server documentation
