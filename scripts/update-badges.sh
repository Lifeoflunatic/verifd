#!/bin/bash

# Update coverage badges in README and documentation
# Run after coverage reports are generated

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Parse coverage from lcov.info
get_coverage_percentage() {
  local lcov_file=$1
  if [ ! -f "$lcov_file" ]; then
    echo "0"
    return
  fi
  
  # Extract line coverage percentage
  local lines_hit=$(grep -E "^LH:" "$lcov_file" | awk -F: '{sum+=$2} END {print sum}')
  local lines_total=$(grep -E "^LF:" "$lcov_file" | awk -F: '{sum+=$2} END {print sum}')
  
  if [ "$lines_total" -eq 0 ]; then
    echo "0"
  else
    echo "$((lines_hit * 100 / lines_total))"
  fi
}

# Get test count
get_test_count() {
  local test_output=$(USE_MOCK_DB=true pnpm -F @verifd/backend test 2>&1 | grep "Tests" | tail -1)
  echo "$test_output" | grep -oE "[0-9]+ passed" | grep -oE "[0-9]+" || echo "0"
}

# Determine badge color based on percentage
get_badge_color() {
  local percentage=$1
  if [ "$percentage" -ge 80 ]; then
    echo "brightgreen"
  elif [ "$percentage" -ge 70 ]; then
    echo "green"
  elif [ "$percentage" -ge 60 ]; then
    echo "yellow"
  elif [ "$percentage" -ge 50 ]; then
    echo "orange"
  else
    echo "red"
  fi
}

# Main execution
echo "📊 Updating coverage badges..."

# Get coverage percentage
COVERAGE_FILE="apps/backend/coverage/lcov.info"
COVERAGE_PCT=$(get_coverage_percentage "$COVERAGE_FILE")
COVERAGE_COLOR=$(get_badge_color "$COVERAGE_PCT")

# Get test count
TEST_COUNT=$(get_test_count)

echo -e "${GREEN}Coverage: ${COVERAGE_PCT}%${NC}"
echo -e "${GREEN}Tests: ${TEST_COUNT} passing${NC}"

# Update badges in TESTING_STRATEGY.md
STRATEGY_FILE="OPS/TESTING_STRATEGY.md"
if [ -f "$STRATEGY_FILE" ]; then
  # Update coverage badge
  sed -i.bak "s/coverage-[0-9]*%25-[a-z]*/coverage-${COVERAGE_PCT}%25-${COVERAGE_COLOR}/g" "$STRATEGY_FILE"
  
  # Update test count badge
  sed -i.bak "s/tests-[0-9]*%20passing/tests-${TEST_COUNT}%20passing/g" "$STRATEGY_FILE"
  
  rm "${STRATEGY_FILE}.bak"
  echo -e "${GREEN}✅ Updated ${STRATEGY_FILE}${NC}"
fi

# Update README if it exists
README_FILE="README.md"
if [ -f "$README_FILE" ] && grep -q "badge" "$README_FILE"; then
  sed -i.bak "s/coverage-[0-9]*%25-[a-z]*/coverage-${COVERAGE_PCT}%25-${COVERAGE_COLOR}/g" "$README_FILE"
  sed -i.bak "s/tests-[0-9]*%20passing/tests-${TEST_COUNT}%20passing/g" "$README_FILE"
  rm "${README_FILE}.bak"
  echo -e "${GREEN}✅ Updated ${README_FILE}${NC}"
fi

# Generate coverage report summary
echo ""
echo "📈 Coverage Summary:"
echo "===================="
if [ -f "$COVERAGE_FILE" ]; then
  # Get detailed metrics
  FUNCTIONS_HIT=$(grep -E "^FNH:" "$COVERAGE_FILE" | awk -F: '{sum+=$2} END {print sum}')
  FUNCTIONS_TOTAL=$(grep -E "^FNF:" "$COVERAGE_FILE" | awk -F: '{sum+=$2} END {print sum}')
  BRANCHES_HIT=$(grep -E "^BRH:" "$COVERAGE_FILE" | awk -F: '{sum+=$2} END {print sum}')
  BRANCHES_TOTAL=$(grep -E "^BRF:" "$COVERAGE_FILE" | awk -F: '{sum+=$2} END {print sum}')
  
  echo "Lines:     ${COVERAGE_PCT}%"
  if [ "$FUNCTIONS_TOTAL" -gt 0 ]; then
    echo "Functions: $((FUNCTIONS_HIT * 100 / FUNCTIONS_TOTAL))%"
  fi
  if [ "$BRANCHES_TOTAL" -gt 0 ]; then
    echo "Branches:  $((BRANCHES_HIT * 100 / BRANCHES_TOTAL))%"
  fi
else
  echo "No coverage data available. Run tests with coverage first:"
  echo "USE_MOCK_DB=true pnpm -F @verifd/backend vitest run --coverage"
fi

echo ""
echo "✨ Badge update complete!"