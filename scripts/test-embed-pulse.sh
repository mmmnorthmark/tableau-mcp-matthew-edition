#!/bin/bash

# Test script for embed-pulse-metric tool
# Usage: ./scripts/test-embed-pulse.sh [metricId]

set -e

echo "🔍 Testing embed-pulse-metric tool..."
echo ""

# First, list available metrics
echo "1️⃣  Fetching available metrics..."
curl -s http://localhost:3927/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "list-all-pulse-metric-definitions",
      "arguments": {
        "view": "DEFINITION_VIEW_FULL"
      }
    }
  }' | jq '.result.content[0].text' | head -20

echo ""
echo "2️⃣  Testing embed-pulse-metric with metricId..."

METRIC_ID=${1:-"test-metric-id"}

curl -v http://localhost:3927/tools/call \
  -H "Content-Type: application/json" \
  -d "{
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"embed-pulse-metric\",
      \"arguments\": {
        \"metricId\": \"$METRIC_ID\"
      }
    }
  }" 2>&1 | tee /tmp/embed-pulse-debug.log

echo ""
echo "📝 Full debug log saved to /tmp/embed-pulse-debug.log"
