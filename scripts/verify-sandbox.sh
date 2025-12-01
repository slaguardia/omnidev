#!/bin/bash
# =============================================================================
# Sandbox Verification Script
# =============================================================================
# This script verifies that the sandbox architecture is working correctly
# Run inside the Docker container to test security measures
#
# Usage: docker exec workflow-app /app/scripts/verify-sandbox.sh
# =============================================================================

set -e

echo "========================================="
echo "Sandbox Security Verification"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# Test Helper Functions
# =============================================================================

test_blocked_command() {
  local cmd="$1"
  local description="$2"

  echo -n "Testing: $description... "

  if $cmd > /dev/null 2>&1; then
    echo -e "${RED}FAIL${NC} - Command succeeded when it should be blocked!"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  else
    echo -e "${GREEN}PASS${NC} - Command blocked as expected"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  fi
}

test_internal_command() {
  local cmd="$1"
  local description="$2"

  echo -n "Testing: $description... "

  if $cmd > /dev/null 2>&1; then
    echo -e "${GREEN}PASS${NC} - Command accessible"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}FAIL${NC} - Command not accessible!"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# =============================================================================
# Environment Checks
# =============================================================================

echo "1. Environment Configuration"
echo "-----------------------------"

echo "Current user: $(whoami)"
echo "Working directory: $(pwd)"
echo ""

# =============================================================================
# Test Blocked Executables
# =============================================================================

echo "2. Testing Blocked Executables (Should Fail)"
echo "--------------------------------------------"
echo "Note: Only git is blocked. Claude Code can access rm, curl, wget."
echo ""

test_blocked_command "git --version" "git command blocking"

echo ""

# =============================================================================
# Test Internal Executables
# =============================================================================

echo "3. Testing Internal Git Binary (Should Succeed)"
echo "-----------------------------------------------"

test_internal_command "/opt/internal/bin/git --version" "internal git binary"

echo ""
echo "4. Testing Accessible Executables (Should Succeed)"
echo "--------------------------------------------------"
echo "Claude Code should have access to these tools:"
echo ""

test_internal_command "curl --version" "curl command"
test_internal_command "wget --version" "wget command"
test_internal_command "rm --version" "rm command"

echo ""

# =============================================================================
# Test Wrapper Script
# =============================================================================

echo "5. Testing Claude Code Wrapper"
echo "-------------------------------"

if [ -x "/usr/local/bin/claude-code-wrapper" ]; then
  echo -e "${GREEN}PASS${NC} - Wrapper script exists and is executable"
  TESTS_PASSED=$((TESTS_PASSED + 1))

  # Show wrapper script content (first few lines)
  echo "Wrapper script preview:"
  head -n 20 /usr/local/bin/claude-code-wrapper | sed 's/^/  /'
else
  echo -e "${RED}FAIL${NC} - Wrapper script not found or not executable"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""

# =============================================================================
# Test File Permissions
# =============================================================================

echo "6. Testing File Permissions"
echo "---------------------------"

echo "Internal git binary:"
ls -l /opt/internal/bin/git 2>/dev/null | sed 's/^/  /' || echo "  Git binary not found"

echo ""
echo "Git blocking wrapper:"
ls -l /usr/bin/git 2>/dev/null | sed 's/^/  /' || echo "  Wrapper not found"

# Check if it's actually a wrapper script
if [ -f "/usr/bin/git" ] && head -n 1 /usr/bin/git | grep -q "#!/bin/bash"; then
  echo -e "  ${GREEN}✓ /usr/bin/git is a blocking script${NC}"
else
  echo -e "  ${RED}✗ /usr/bin/git is not a wrapper script${NC}"
fi

echo ""

# =============================================================================
# Test PATH Configuration
# =============================================================================

echo "7. Testing PATH Configuration"
echo "------------------------------"

echo "Current PATH: $PATH"
echo ""

if echo "$PATH" | grep -q "/opt/internal/bin"; then
  echo -e "${YELLOW}WARNING: /opt/internal/bin is in PATH${NC}"
  echo "Claude Code may be able to access internal executables!"
  echo "This is OK for the main app, but the wrapper should remove this."
else
  echo -e "${GREEN}PASS${NC} - /opt/internal/bin not in PATH"
  TESTS_PASSED=$((TESTS_PASSED + 1))
fi

echo ""

# =============================================================================
# Summary
# =============================================================================

echo "========================================="
echo "Verification Summary"
echo "========================================="
echo ""
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed! Sandbox is working correctly.${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed. Please review the output above.${NC}"
  exit 1
fi
