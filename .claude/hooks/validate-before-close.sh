#!/bin/bash
# Hook: Validation Reminder for bd close
#
# This hook checks if a "bd close" command is being executed and
# outputs a reminder about validation. It does NOT block the command
# but ensures Claude sees the reminder in the hook output.
#
# Exit codes:
#   0 = success (continue with command)
#   2 = blocking error (would prevent command)

# Read the JSON input from stdin
INPUT=$(cat)

# Extract the command using Python (more portable than jq)
COMMAND=$(echo "$INPUT" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('tool_input', {}).get('command', ''))" 2>/dev/null)

# Check if this is a "bd close" command
if [[ "$COMMAND" == *"bd close"* ]]; then
  # Output reminder to stderr (shown to Claude)
  cat >&2 << 'EOF'
=== VALIDATION REMINDER ===
Before closing this bead, confirm:
  [ ] validation-before-close skill was invoked
  [ ] Build passes (npm run build)
  [ ] Tests pass (if applicable)
  [ ] Changes work as expected
  [ ] Documentation updated (if needed)
===========================
EOF
fi

# Always exit 0 - we don't want to block, just remind
exit 0
