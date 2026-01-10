#!/bin/bash

# Comprehensive test runner for zk_invoice.aleo
# Usage: ./run_tests.sh [function_name]
# Example: ./run_tests.sh create_invoice

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

# Function to run a test
run_test() {
    local function_name=$1
    local test_name=$2
    local args=$3

    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    print_info "Running: $test_name"

    if leo run $function_name $args > /dev/null 2>&1; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        print_success "$test_name passed"
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        print_error "$test_name failed"
    fi
}

# Test create_invoice function
test_create_invoice() {
    print_header "Testing create_invoice"

    # Test 1: Normal invoice creation
    run_test "create_invoice" \
        "Normal invoice creation" \
        "aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc 1000000u64 1735689600u32 123456789field 99999field"

    # Test 2: Minimum amount
    run_test "create_invoice" \
        "Minimum amount (1u64)" \
        "aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc 1u64 1735689600u32 123456789field 11111field"

    # Test 3: Large amount
    run_test "create_invoice" \
        "Large amount invoice" \
        "aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc 1000000000000u64 1735689600u32 123456789field 22222field"

    # Test 4: Different nonce
    run_test "create_invoice" \
        "Different nonce" \
        "aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc 1000000u64 1735689600u32 123456789field 1field"

    # Test 5: Different hash
    run_test "create_invoice" \
        "Different invoice hash" \
        "aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc 1000000u64 1735689600u32 987654321field 33333field"

    print_info "create_invoice tests completed"
}

# Test verify_invoice function
test_verify_invoice() {
    print_header "Testing verify_invoice"

    print_warning "verify_invoice tests require invoice records from create_invoice"
    print_info "Manual testing recommended - see tests/README.md"
    print_info "verify_invoice tests skipped (requires record input)"
}

# Test mark_as_paid function
test_mark_as_paid() {
    print_header "Testing mark_as_paid"

    print_warning "mark_as_paid tests require invoice records"
    print_info "Manual testing recommended - see tests/README.md"
    print_info "mark_as_paid tests skipped (requires record input)"
}

# Test create_seller_receipt function
test_create_seller_receipt() {
    print_header "Testing create_seller_receipt"

    # Test 1: Normal seller receipt
    run_test "create_seller_receipt" \
        "Normal seller receipt creation" \
        "1234567890field aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc 1000000u64 88888field"

    # Test 2: Small amount
    run_test "create_seller_receipt" \
        "Small amount receipt" \
        "1111111111field aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc 1u64 11111field"

    # Test 3: Large amount
    run_test "create_seller_receipt" \
        "Large amount receipt" \
        "2222222222field aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc 1000000000000u64 22222field"

    # Test 4: Different payment nonce
    run_test "create_seller_receipt" \
        "Different payment nonce" \
        "3333333333field aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk9svjc aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc 1000000u64 1field"

    print_info "create_seller_receipt tests completed"
}

# Test cancel_invoice function
test_cancel_invoice() {
    print_header "Testing cancel_invoice"

    print_warning "cancel_invoice tests require invoice records"
    print_info "Manual testing recommended - see tests/README.md"
    print_info "cancel_invoice tests skipped (requires record input)"
}

# Test verify_payment function
test_verify_payment() {
    print_header "Testing verify_payment"

    print_warning "verify_payment tests require both payment and invoice records"
    print_info "Manual testing recommended - see tests/README.md"
    print_info "verify_payment tests skipped (requires record input)"
}

# Integration test
test_integration() {
    print_header "Integration Test: Complete Invoice Workflow"

    print_info "Step 1: Create invoice"
    print_warning "Integration tests require interactive record management"
    print_info "See tests/README.md for complete workflow testing guide"
    print_info "Integration tests skipped (requires manual record tracking)"
}

# Print test summary
print_summary() {
    print_header "Test Summary"
    echo -e "Total Tests:  ${BLUE}${TOTAL_TESTS}${NC}"
    echo -e "Passed:       ${GREEN}${PASSED_TESTS}${NC}"
    echo -e "Failed:       ${RED}${FAILED_TESTS}${NC}"

    if [ $FAILED_TESTS -eq 0 ]; then
        print_success "All tests passed!"
        return 0
    else
        print_error "Some tests failed!"
        return 1
    fi
}

# Main execution
main() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════╗"
    echo "║   zk_invoice.aleo Test Suite          ║"
    echo "╔════════════════════════════════════════╗"
    echo -e "${NC}\n"

    # Check if Leo is installed
    if ! command -v leo &> /dev/null; then
        print_error "Leo CLI not found. Please install Leo first."
        echo "Visit: https://developer.aleo.org/leo/installation"
        exit 1
    fi

    print_info "Leo version: $(leo --version)"

    # Parse command line arguments
    if [ $# -eq 0 ]; then
        # Run all tests
        test_create_invoice
        test_verify_invoice
        test_mark_as_paid
        test_create_seller_receipt
        test_cancel_invoice
        test_verify_payment
        test_integration
    else
        # Run specific test
        case $1 in
            create_invoice)
                test_create_invoice
                ;;
            verify_invoice)
                test_verify_invoice
                ;;
            mark_as_paid)
                test_mark_as_paid
                ;;
            create_seller_receipt)
                test_create_seller_receipt
                ;;
            cancel_invoice)
                test_cancel_invoice
                ;;
            verify_payment)
                test_verify_payment
                ;;
            integration)
                test_integration
                ;;
            *)
                print_error "Unknown test: $1"
                echo "Available tests:"
                echo "  - create_invoice"
                echo "  - verify_invoice"
                echo "  - mark_as_paid"
                echo "  - create_seller_receipt"
                echo "  - cancel_invoice"
                echo "  - verify_payment"
                echo "  - integration"
                exit 1
                ;;
        esac
    fi

    # Print summary
    print_summary
}

# Run main function
main "$@"
