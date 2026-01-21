#!/bin/bash
set -e

echo "=== E2E Ingest Test ==="
echo ""

# Configuration
API_URL="${API_URL:-http://localhost:3001}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-test-password}"
POLL_TIMEOUT=60
POLL_INTERVAL=2

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper: Check command exists
check_command() {
  if ! command -v "$1" &> /dev/null; then
    echo -e "${RED}ERROR: $1 not found${NC}"
    return 1
  fi
  return 0
}

# Helper: Check API is up
check_api() {
  if ! curl -sf "${API_URL}/health" > /dev/null; then
    echo -e "${RED}ERROR: API not responding at ${API_URL}${NC}"
    echo "Start with: cd api && npm run dev"
    return 1
  fi
  return 0
}

echo "1. Checking prerequisites..."

# Check required tools
check_command "curl" || exit 1
check_command "jq" || exit 1
check_command "claude" || {
  echo -e "${YELLOW}Warning: Claude CLI not found. Full pipeline tests may fail.${NC}"
  echo "Install with: npm install -g @anthropic-ai/claude-code"
}

# Check API
check_api || exit 1
echo -e "${GREEN}   API is running at ${API_URL}${NC}"

echo ""
echo "2. Testing Claude CLI..."
CLAUDE_RESPONSE=$(echo "Say OK" | claude --print - 2>&1 || true)
if echo "$CLAUDE_RESPONSE" | grep -qi "ok\|error\|cli"; then
  echo -e "${GREEN}   Claude CLI responsive${NC}"
else
  echo -e "${YELLOW}   Warning: Claude CLI may not be working properly${NC}"
  echo "   Response: $CLAUDE_RESPONSE"
fi

echo ""
echo "3. Submitting test ingest..."
TIMESTAMP=$(date +%s)
RESPONSE=$(curl -sf -X POST "${API_URL}/admin/ingest" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Password: ${ADMIN_PASSWORD}" \
  -d "{
    \"items\": [{
      \"source_type\": \"text\",
      \"content\": \"# E2E Test Page ${TIMESTAMP}\\n\\nThis page was created by the E2E test at $(date).\\n\\nIt tests the full ingest pipeline including:\\n- Content extraction\\n- Claude CLI routing\\n- Claude CLI integration\\n- Local embeddings generation\\n- Database persistence\"
    }]
  }" 2>&1)

if [ $? -ne 0 ]; then
  echo -e "${RED}ERROR: Failed to submit ingest job${NC}"
  echo "$RESPONSE"
  exit 1
fi

JOB_ID=$(echo "$RESPONSE" | jq -r '.job.id')
JOB_STATUS=$(echo "$RESPONSE" | jq -r '.job.status')

if [ -z "$JOB_ID" ] || [ "$JOB_ID" = "null" ]; then
  echo -e "${RED}ERROR: No job ID returned${NC}"
  echo "$RESPONSE"
  exit 1
fi

echo -e "${GREEN}   Job created: ${JOB_ID}${NC}"
echo "   Status: ${JOB_STATUS}"

echo ""
echo "4. Polling for completion..."

ELAPSED=0
while [ $ELAPSED -lt $POLL_TIMEOUT ]; do
  RESPONSE=$(curl -sf "${API_URL}/admin/ingest/jobs/${JOB_ID}" \
    -H "X-Admin-Password: ${ADMIN_PASSWORD}" 2>&1)

  STATUS=$(echo "$RESPONSE" | jq -r '.job.status')
  PROCESSED=$(echo "$RESPONSE" | jq -r '.job.processed_items')
  FAILED=$(echo "$RESPONSE" | jq -r '.job.failed_items')

  printf "\r   [%2ds] Status: %-12s Processed: %s  Failed: %s" $ELAPSED "$STATUS" "$PROCESSED" "$FAILED"

  if [ "$STATUS" = "completed" ]; then
    echo ""
    echo ""
    echo -e "${GREEN}5. SUCCESS! Job completed.${NC}"
    echo ""
    echo "   Job Details:"
    echo "$RESPONSE" | jq '.job | {id, status, total_items, processed_items, failed_items}'
    echo ""
    echo "   Item Details:"
    echo "$RESPONSE" | jq '.items[0] | {status, routing_decision, target_page_id, extracted_title}'
    echo ""
    exit 0
  fi

  if [ "$STATUS" = "failed" ]; then
    echo ""
    echo ""
    echo -e "${RED}5. FAILED! Job failed.${NC}"
    echo ""
    echo "   Error:"
    echo "$RESPONSE" | jq '.items[0].error_message'
    echo ""
    echo "   Full response:"
    echo "$RESPONSE" | jq '.'
    exit 1
  fi

  sleep $POLL_INTERVAL
  ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

echo ""
echo ""
echo -e "${RED}5. TIMEOUT! Job did not complete within ${POLL_TIMEOUT}s${NC}"
echo ""
echo "   Last status:"
echo "$RESPONSE" | jq '.job | {id, status, processed_items, failed_items}'
exit 1
