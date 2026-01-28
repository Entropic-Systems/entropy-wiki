#!/bin/bash
# Hook: Auto-Bug Detection on Commit CI Failures
#
# Monitors commits for CI failures and triggers appropriate responses:
# 1. Detects CI failure patterns in git commit context
# 2. Triggers debug bundle collection on failures
# 3. Creates bug beads for actionable issues
# 4. Parses conventional commits for categorization
#
# Integrates with:
# - auto-bug-tracking skill
# - debug-bundle.yml GitHub Actions workflow
# - validation-before-close.sh hook
#
# Exit codes:
#   0 = success (continue with command)
#   2 = blocking error (would prevent command)
#
# Bead: entropy-wiki-1ua

set -euo pipefail

# Configuration
AUTO_BUG_ENABLED="${AUTO_BUG_ENABLED:-true}"
DEBUG_BUNDLE_TRIGGER="${DEBUG_BUNDLE_TRIGGER:-true}"
CI_FAILURE_CHECK_TIMEOUT="${CI_FAILURE_CHECK_TIMEOUT:-10}"
GITHUB_REPO="${GITHUB_REPO:-}"
MAX_AUTO_BEADS="${MAX_AUTO_BEADS:-3}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Read the JSON input from stdin
INPUT=$(cat)

# Extract the command using Python
COMMAND=$(echo "$INPUT" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('tool_input', {}).get('command', ''))" 2>/dev/null || echo "")

# Helper function for colored output
print_status() {
  local color="$1"
  local status="$2"
  local message="$3"
  echo -e "${color}[${status}]${NC} ${message}" >&2
}

# Parse conventional commit type from message
parse_commit_type() {
  local message="$1"

  # Extract type from conventional commit format: type(scope): description
  local commit_type
  commit_type=$(echo "$message" | sed -n 's/^\([a-z]*\).*/\1/p')

  case "$commit_type" in
    "feat"|"feature")
      echo "feature"
      ;;
    "fix"|"bugfix")
      echo "bug"
      ;;
    "docs"|"documentation")
      echo "docs"
      ;;
    "test"|"tests")
      echo "task"
      ;;
    "refactor")
      echo "task"
      ;;
    "chore")
      echo "task"
      ;;
    *)
      echo "bug"  # Default to bug for failures
      ;;
  esac
}

# Determine bead priority based on failure severity
determine_priority() {
  local failure_type="$1"

  case "$failure_type" in
    "build")
      echo "1"  # P1 - Critical
      ;;
    "test")
      echo "2"  # P2 - High
      ;;
    "lint")
      echo "3"  # P3 - Medium
      ;;
    *)
      echo "2"  # P2 - Default
      ;;
  esac
}

# Check CI status for recent commits
check_ci_status() {
  if [ -z "$GITHUB_REPO" ]; then
    return 0
  fi

  if ! command -v gh &> /dev/null; then
    print_status "$YELLOW" "SKIP" "gh CLI not available for CI check"
    return 0
  fi

  # Get latest workflow run status
  local run_info
  run_info=$(timeout "$CI_FAILURE_CHECK_TIMEOUT" gh run list --repo "$GITHUB_REPO" --limit 1 --json conclusion,headSha,name,status,workflowName 2>/dev/null || echo "{}")

  local conclusion
  conclusion=$(echo "$run_info" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data[0].get('conclusion', 'unknown') if data else 'unknown')" 2>/dev/null || echo "unknown")

  local workflow_name
  workflow_name=$(echo "$run_info" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data[0].get('workflowName', 'unknown') if data else 'unknown')" 2>/dev/null || echo "unknown")

  if [ "$conclusion" = "failure" ]; then
    print_status "$RED" "FAIL" "CI Failure detected in workflow: $workflow_name"
    echo "failure:$workflow_name"
  else
    echo "success"
  fi
}

# Trigger debug bundle collection
trigger_debug_collection() {
  local failure_info="$1"

  if [ "$DEBUG_BUNDLE_TRIGGER" != "true" ]; then
    return 0
  fi

  if [ -z "$GITHUB_REPO" ]; then
    print_status "$YELLOW" "SKIP" "Cannot trigger debug collection: GITHUB_REPO not set"
    return 0
  fi

  if ! command -v gh &> /dev/null; then
    print_status "$YELLOW" "SKIP" "Cannot trigger debug collection: gh CLI not available"
    return 0
  fi

  # Check if debug-bundle workflow exists
  local workflow_exists
  workflow_exists=$(gh workflow list --repo "$GITHUB_REPO" --json name --jq '.[] | select(.name == "Debug Bundle Collection") | .name' 2>/dev/null || echo "")

  if [ -z "$workflow_exists" ]; then
    print_status "$YELLOW" "SKIP" "Debug Bundle workflow not found in repository"
    return 0
  fi

  # Trigger the workflow
  print_status "$BLUE" "INFO" "Triggering debug bundle collection..."

  if gh workflow run "debug-bundle.yml" --repo "$GITHUB_REPO" -f mode=full 2>/dev/null; then
    print_status "$GREEN" "OK" "Debug bundle collection triggered"
  else
    print_status "$YELLOW" "WARN" "Failed to trigger debug bundle collection"
  fi
}

# Create a bug bead for CI failure
create_failure_bead() {
  local workflow_name="$1"
  local commit_sha="$2"
  local commit_msg="$3"

  if ! command -v bd &> /dev/null; then
    print_status "$YELLOW" "SKIP" "bd CLI not available for bead creation"
    return 0
  fi

  # Check current open bug bead count
  local open_bugs
  open_bugs=$(bd list --status=open --type=bug 2>/dev/null | wc -l || echo "0")

  if [ "$open_bugs" -ge "$MAX_AUTO_BEADS" ]; then
    print_status "$YELLOW" "SKIP" "Max auto-beads reached ($MAX_AUTO_BEADS) - not creating new bead"
    return 0
  fi

  # Parse commit type for categorization
  local bead_type
  bead_type=$(parse_commit_type "$commit_msg")

  local priority
  priority=$(determine_priority "build")

  local title="CI Failure: $workflow_name (${commit_sha:0:7})"
  local description="Auto-detected CI failure in workflow '$workflow_name' after commit ${commit_sha:0:7}.

**Commit Message:** $commit_msg

**Suggested Actions:**
1. Review the workflow logs for error details
2. Run \`npm run debug:collect\` for detailed debug bundle
3. Fix the underlying issue
4. Re-run the workflow to verify fix

**Auto-generated by:** auto-bead-on-commit hook"

  print_status "$BLUE" "INFO" "Creating bug bead for CI failure..."

  if bd create --title="$title" --type=bug --priority="$priority" 2>/dev/null; then
    print_status "$GREEN" "OK" "Bug bead created for CI failure"
  else
    print_status "$YELLOW" "WARN" "Failed to create bug bead"
  fi
}

# Main logic for git commit/push detection
if [[ "$COMMAND" == *"git push"* ]] || [[ "$COMMAND" == *"git commit"* ]]; then
  if [ "$AUTO_BUG_ENABLED" != "true" ]; then
    exit 0
  fi

  # Give CI a moment to start (non-blocking info)
  print_status "$BLUE" "INFO" "Commit detected - CI status will be monitored"

  # Quick check of current CI status
  ci_result=$(check_ci_status)

  if [[ "$ci_result" == failure:* ]]; then
    workflow_name="${ci_result#failure:}"

    # Get commit info
    commit_sha=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    commit_msg=$(git log -1 --format="%s" 2>/dev/null || echo "unknown")

    print_status "$RED" "ALERT" "CI failure detected - initiating auto-bug response"

    # Trigger debug collection
    trigger_debug_collection "$workflow_name"

    # Create bug bead
    create_failure_bead "$workflow_name" "$commit_sha" "$commit_msg"
  fi
fi

# Also monitor after workflow completion (called by external trigger)
if [[ "$COMMAND" == *"auto-bug-check"* ]]; then
  ci_result=$(check_ci_status)

  if [[ "$ci_result" == failure:* ]]; then
    workflow_name="${ci_result#failure:}"
    commit_sha=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    commit_msg=$(git log -1 --format="%s" 2>/dev/null || echo "unknown")

    trigger_debug_collection "$workflow_name"
    create_failure_bead "$workflow_name" "$commit_sha" "$commit_msg"
  fi
fi

# Always exit 0 - fail-open design
exit 0
