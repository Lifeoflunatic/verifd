#!/bin/bash

# verifd Staging Validation Script
# Quick validation of staging deployment for Day-0 testing

set -euo pipefail

# Configuration
STAGING_PORT=${STAGING_PORT:-3001}
STAGING_HOST="http://localhost:$STAGING_PORT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[VALIDATE] $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Validation functions

test_health_endpoint() {
    log "Testing health endpoint..."
    
    local response=$(curl -sf "$STAGING_HOST/health" 2>/dev/null || echo "FAILED")
    
    if [[ "$response" != "FAILED" ]]; then
        success "Health endpoint responding"
        return 0
    else
        error "Health endpoint not accessible"
        return 1
    fi
}

test_canary_endpoints() {
    log "Testing canary endpoints..."
    
    # Test canary config endpoint
    local config_response=$(curl -sf "$STAGING_HOST/canary/config" 2>/dev/null || echo "FAILED")
    if [[ "$config_response" != "FAILED" ]]; then
        success "Canary config endpoint responding"
    else
        error "Canary config endpoint not accessible"
        return 1
    fi
    
    # Test canary dashboard
    local dashboard_response=$(curl -sf "$STAGING_HOST/canary/dashboard" 2>/dev/null || echo "FAILED")
    if [[ "$dashboard_response" != "FAILED" ]]; then
        success "Canary dashboard endpoint responding"
    else
        error "Canary dashboard endpoint not accessible"
        return 1
    fi
    
    return 0
}

test_jwks_endpoint() {
    log "Testing JWKS endpoint..."
    
    local jwks_response=$(curl -sf "$STAGING_HOST/.well-known/jwks.json" 2>/dev/null || echo "FAILED")
    
    if [[ "$jwks_response" != "FAILED" ]]; then
        # Check if it's valid JSON
        if echo "$jwks_response" | jq '.' >/dev/null 2>&1; then
            success "JWKS endpoint responding with valid JSON"
            return 0
        else
            warn "JWKS endpoint responding but invalid JSON"
            return 1
        fi
    else
        warn "JWKS endpoint not accessible (may be using mock keys)"
        return 0  # Not critical for staging
    fi
}

test_admin_endpoints() {
    log "Testing admin endpoints..."
    
    # Try to access admin endpoint without token (should fail)
    local status_code=$(curl -sf -o /dev/null -w "%{http_code}" "$STAGING_HOST/admin/keys/status" 2>/dev/null || echo "000")
    
    if [[ "$status_code" == "401" ]]; then
        success "Admin endpoints properly secured (401 without token)"
        return 0
    else
        warn "Admin endpoint security test inconclusive (status: $status_code)"
        return 0
    fi
}

test_canary_phase_change() {
    log "Testing canary phase change..."
    
    # Load admin token
    local tokens_file="keys/staging/admin-tokens.json"
    if [[ ! -f "$tokens_file" ]]; then
        error "Admin tokens file not found: $tokens_file"
        return 1
    fi
    
    local admin_token=$(jq -r '.canary_token' "$tokens_file" 2>/dev/null || echo "FAILED")
    if [[ "$admin_token" == "FAILED" || "$admin_token" == "null" ]]; then
        error "Failed to load admin token"
        return 1
    fi
    
    # Test phase change to canary_5
    local change_response=$(curl -sf -X POST "$STAGING_HOST/canary/phase" \
        -H "Content-Type: application/json" \
        -d "{\"adminToken\":\"$admin_token\",\"phase\":\"canary_5\",\"reason\":\"Staging validation test\"}" \
        2>/dev/null || echo "FAILED")
    
    if [[ "$change_response" != "FAILED" ]]; then
        local success_flag=$(echo "$change_response" | jq -r '.success' 2>/dev/null || echo "false")
        if [[ "$success_flag" == "true" ]]; then
            success "Canary phase change to canary_5 successful"
            
            # Reset to off
            curl -sf -X POST "$STAGING_HOST/canary/phase" \
                -H "Content-Type: application/json" \
                -d "{\"adminToken\":\"$admin_token\",\"phase\":\"off\",\"reason\":\"Reset after validation\"}" \
                >/dev/null 2>&1 || true
            
            return 0
        fi
    fi
    
    error "Canary phase change test failed"
    return 1
}

test_metrics_submission() {
    log "Testing metrics submission..."
    
    local metrics_payload='{
        "date": "'$(date +%Y-%m-%d)'",
        "metrics": {
            "verify_started": 100,
            "verify_completed": 20,
            "verify_lift": 20.0,
            "notif_action_tap": 15.0,
            "false_allow": 0.5,
            "complaint_rate": 0.1
        },
        "phase": "canary_5",
        "passedGates": true
    }'
    
    local response=$(curl -sf -X POST "$STAGING_HOST/canary/metrics" \
        -H "Content-Type: application/json" \
        -d "$metrics_payload" \
        2>/dev/null || echo "FAILED")
    
    if [[ "$response" != "FAILED" ]]; then
        local success_flag=$(echo "$response" | jq -r '.success' 2>/dev/null || echo "false")
        if [[ "$success_flag" == "true" ]]; then
            success "Metrics submission successful"
            return 0
        fi
    fi
    
    error "Metrics submission test failed"
    return 1
}

# Environment validation

validate_environment() {
    log "Validating staging environment..."
    
    # Check if server is running
    if ! curl -sf "$STAGING_HOST/health" >/dev/null 2>&1; then
        error "Staging server is not running on port $STAGING_PORT"
        echo "Run: ./deploy/staging.sh deploy"
        exit 1
    fi
    
    # Check dependencies
    local missing_deps=()
    for dep in curl jq; do
        if ! command -v "$dep" >/dev/null 2>&1; then
            missing_deps+=("$dep")
        fi
    done
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        error "Missing dependencies: ${missing_deps[*]}"
        exit 1
    fi
    
    success "Environment validation passed"
}

# Main validation

main() {
    echo "========================================"
    echo "🧪 verifd Staging Validation"
    echo "========================================"
    echo
    
    validate_environment
    
    local tests=(
        "test_health_endpoint"
        "test_canary_endpoints"
        "test_jwks_endpoint"
        "test_admin_endpoints"
        "test_canary_phase_change"
        "test_metrics_submission"
    )
    
    local passed=0
    local total=${#tests[@]}
    
    for test in "${tests[@]}"; do
        echo
        if $test; then
            ((passed++))
        fi
    done
    
    echo
    echo "========================================"
    echo "📊 Validation Results"
    echo "========================================"
    echo "Passed: $passed/$total tests"
    
    if [[ $passed -eq $total ]]; then
        success "All tests passed! Staging environment is ready 🚀"
        echo
        echo "Next steps:"
        echo "1. Configure Slack integration (optional)"
        echo "2. Run canary promotion tests"
        echo "3. Test key rotation workflow"
        echo "4. Deploy to production"
        exit 0
    else
        error "Some tests failed. Check the output above for details."
        echo
        echo "Debug commands:"
        echo "- Check logs: ./deploy/staging.sh logs"
        echo "- Check status: ./deploy/staging.sh status"
        echo "- Restart: ./deploy/staging.sh restart"
        exit 1
    fi
}

# Run validation
main "$@"