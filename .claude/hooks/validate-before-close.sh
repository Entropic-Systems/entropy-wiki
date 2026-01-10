#!/bin/bash
# Hook: Validation Reminders for Bead Workflow
#
# This hook provides reminders at key workflow points:
# 1. When starting work (bd update --status=in_progress) - plan validation
# 2. When closing (bd close) - verify validation was done
#
# Exit codes:
#   0 = success (continue with command)
#   2 = blocking error (would prevent command)

# Read the JSON input from stdin
INPUT=$(cat)

# Extract the command using Python (more portable than jq)
COMMAND=$(echo "$INPUT" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('tool_input', {}).get('command', ''))" 2>/dev/null)

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

# Reminder before closing a bead
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
fi

# Always exit 0 - we don't want to block, just remind
exit 0
