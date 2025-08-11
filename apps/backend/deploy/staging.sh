#!/bin/bash

# verifd Staging Deployment Script
# Deploys canary controller, key rotation, and release train for staging validation

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/apps/backend"
STAGING_ENV_FILE="$BACKEND_DIR/.env.staging"
STAGING_DB="$BACKEND_DIR/var/db/verifd-staging.sqlite"
STAGING_CONFIG_DIR="$BACKEND_DIR/config/staging"
STAGING_LOGS_DIR="$BACKEND_DIR/logs/staging"
STAGING_KEYS_DIR="$BACKEND_DIR/keys/staging"
STAGING_PORT=${STAGING_PORT:-3001}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

# Check dependencies
check_dependencies() {
    log "Checking dependencies..."
    
    local deps=("node" "pnpm" "sqlite3" "openssl" "curl" "jq")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            error "$dep is required but not installed"
            exit 1
        fi
    done
    
    # Check Node.js version
    local node_version=$(node --version | cut -d'v' -f2)
    local major_version=$(echo "$node_version" | cut -d'.' -f1)
    if [ "$major_version" -lt 18 ]; then
        error "Node.js version 18+ required (current: v$node_version)"
        exit 1
    fi
    
    success "Dependencies check passed"
}

# Generate staging JWT keys
generate_staging_keys() {
    log "Generating staging keys..."
    
    mkdir -p "$STAGING_KEYS_DIR"
    
    # Generate Ed25519 key pair for JWKS
    if [ ! -f "$STAGING_KEYS_DIR/signing.key" ]; then
        openssl genpkey -algorithm Ed25519 -out "$STAGING_KEYS_DIR/signing.key"
        openssl pkey -in "$STAGING_KEYS_DIR/signing.key" -pubout -out "$STAGING_KEYS_DIR/signing.pub"
        log "Generated Ed25519 signing key pair"
    fi
    
    # Generate HMAC secrets
    if [ ! -f "$STAGING_KEYS_DIR/hmac.key" ]; then
        openssl rand -hex 32 > "$STAGING_KEYS_DIR/hmac.key"
        log "Generated HMAC secret"
    fi
    
    if [ ! -f "$STAGING_KEYS_DIR/jwt.key" ]; then
        openssl rand -hex 32 > "$STAGING_KEYS_DIR/jwt.key"
        log "Generated JWT secret"
    fi
    
    # Generate canary signing key
    if [ ! -f "$STAGING_KEYS_DIR/canary.key" ]; then
        openssl genpkey -algorithm Ed25519 -out "$STAGING_KEYS_DIR/canary.key"
        log "Generated canary signing key"
    fi
    
    # Generate admin tokens
    if [ ! -f "$STAGING_KEYS_DIR/admin-tokens.json" ]; then
        local canary_token=$(openssl rand -hex 32)
        local kill_switch_token=$(openssl rand -hex 32)
        local admin_signing_key=$(openssl rand -hex 32)
        
        cat > "$STAGING_KEYS_DIR/admin-tokens.json" << EOF
{
  "canary_token": "$canary_token",
  "kill_switch_token": "$kill_switch_token",
  "admin_signing_key": "$admin_signing_key"
}
EOF
        log "Generated admin tokens"
    fi
    
    success "Staging keys generated"
}

# Create JWKS endpoint data
create_jwks_endpoint() {
    log "Creating JWKS endpoint data..."
    
    mkdir -p "$STAGING_CONFIG_DIR"
    
    # Extract public key components for JWKS
    local pub_key_pem=$(cat "$STAGING_KEYS_DIR/signing.pub")
    local key_id="staging-$(date +%Y%m%d)"
    
    # Create JWKS JSON (simplified - in production you'd use proper JWK tools)
    cat > "$STAGING_CONFIG_DIR/jwks.json" << EOF
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "use": "sig",
      "kid": "$key_id",
      "alg": "EdDSA",
      "x": "$(openssl pkey -in "$STAGING_KEYS_DIR/signing.key" -pubout -outform DER | base64 | tr -d '\n')"
    }
  ]
}
EOF
    
    success "JWKS endpoint data created"
}

# Create staging environment file
create_staging_env() {
    log "Creating staging environment configuration..."
    
    local hmac_secret=$(cat "$STAGING_KEYS_DIR/hmac.key")
    local jwt_secret=$(cat "$STAGING_KEYS_DIR/jwt.key")
    local admin_tokens=$(cat "$STAGING_KEYS_DIR/admin-tokens.json")
    local canary_token=$(echo "$admin_tokens" | jq -r '.canary_token')
    local kill_switch_token=$(echo "$admin_tokens" | jq -r '.kill_switch_token')
    local admin_signing_key=$(echo "$admin_tokens" | jq -r '.admin_signing_key')
    
    cat > "$STAGING_ENV_FILE" << EOF
# verifd Staging Environment Configuration
# Generated on $(date -u)

# Environment
NODE_ENV=staging
PORT=$STAGING_PORT
LOG_LEVEL=debug

# Database
DB_DRIVER=sqlite
DB_PATH=$STAGING_DB
DATABASE_URL=$STAGING_DB

# Security
HMAC_SECRET=$hmac_secret
JWT_SECRET=$jwt_secret
LOG_SALT=staging-salt-$(openssl rand -hex 16)

# CORS Configuration
WEB_VERIFY_DEV_ORIGIN=http://localhost:3002
CORS_ORIGIN=http://localhost:3002,https://staging.verifd.com

# Voice Ping Limits (More restrictive in staging)
VOICE_PING_MAX_PER_DAY=1
VOICE_PING_BUSINESS_HOURS_ONLY=true
VOICE_PING_BUSINESS_START=10:00
VOICE_PING_BUSINESS_END=16:00

# vPass Configuration
VPASS_DEFAULT_SCOPE=30m
VPASS_SCOPES=30m,24h

# Rate Limiting (More restrictive)
RATE_LIMIT_PER_IP_MAX=3
RATE_LIMIT_PER_IP_WINDOW=60000
RATE_LIMIT_PER_PHONE_MAX=5
RATE_LIMIT_PER_PHONE_WINDOW=60000

# Channels (SMS only in staging)
CHANNELS=sms
DEFAULT_CHANNEL=sms

# Canary Controller
ADMIN_CANARY_TOKEN=$canary_token
ADMIN_KILL_SWITCH_TOKEN=$kill_switch_token
ADMIN_SIGNING_KEY=$admin_signing_key
CANARY_SIGNING_KEY=\$(cat $STAGING_KEYS_DIR/canary.key | base64 | tr -d '\n')
CANARY_SLACK_CHANNEL=#staging-canary-approvals
GLOBAL_KILL_SWITCH_URL=http://localhost:$STAGING_PORT/config/kill-switch

# Slack Integration (Staging Bot)
SLACK_BOT_TOKEN=\${SLACK_STAGING_BOT_TOKEN}
SLACK_SIGNING_SECRET=\${SLACK_STAGING_SIGNING_SECRET}

# JWKS
JWKS_ENDPOINT_URL=http://localhost:$STAGING_PORT/.well-known/jwks.json
SIGNING_KEY_PATH=$STAGING_KEYS_DIR/signing.key
SIGNING_KEY_ID=staging-$(date +%Y%m%d)

# Release Train
RELEASE_TRAIN_WEBHOOK=\${RELEASE_TRAIN_WEBHOOK_STAGING}
STAGING_DEPLOY_BRANCH=feat/zod-row-typing
EOF
    
    success "Staging environment configuration created"
}

# Initialize staging database
init_staging_database() {
    log "Initializing staging database..."
    
    mkdir -p "$(dirname "$STAGING_DB")"
    
    # Create staging database with test data
    cd "$BACKEND_DIR"
    
    # Set staging environment for database operations
    export NODE_ENV=staging
    export DB_PATH="$STAGING_DB"
    export DATABASE_URL="$STAGING_DB"
    
    # Run migrations
    if [ -f "src/db/migrate.ts" ]; then
        pnpm exec tsx src/db/migrate.ts
        log "Database migrations completed"
    fi
    
    # Seed with test data
    if [ -f "src/db/seed.ts" ]; then
        pnpm exec tsx src/db/seed.ts
        log "Database seeded with test data"
    fi
    
    success "Staging database initialized"
}

# Create staging directories
create_staging_directories() {
    log "Creating staging directories..."
    
    mkdir -p "$STAGING_CONFIG_DIR"
    mkdir -p "$STAGING_LOGS_DIR"
    mkdir -p "$STAGING_KEYS_DIR"
    mkdir -p "$BACKEND_DIR/var/db"
    
    # Set proper permissions
    chmod 700 "$STAGING_KEYS_DIR"
    chmod 600 "$STAGING_KEYS_DIR"/* 2>/dev/null || true
    
    success "Staging directories created"
}

# Deploy canary controller configuration
deploy_canary_config() {
    log "Deploying canary controller configuration..."
    
    # Create staging canary configuration
    cat > "$STAGING_CONFIG_DIR/canary.json" << EOF
{
  "version": 1,
  "timestamp": "$(date -u -Iseconds)",
  "phase": "off",
  "flags": {
    "MISSED_CALL_ACTIONS": {
      "enabled": false,
      "percentage": 0,
      "geo": []
    },
    "enableTemplates": true,
    "enableRiskScoring": {
      "enabled": true,
      "shadowMode": true
    }
  },
  "successGates": {
    "verifyLift": 15,
    "notifActionTap": 10,
    "falseAllow": 1.0,
    "complaintRate": 0.5
  },
  "monitoring": {
    "startDate": "",
    "consecutiveDays": 0,
    "environment": "staging"
  }
}
EOF
    
    success "Canary controller configuration deployed"
}

# Start staging server
start_staging_server() {
    log "Starting staging server..."
    
    cd "$BACKEND_DIR"
    
    # Kill existing staging processes
    pkill -f "PORT=$STAGING_PORT" || true
    sleep 2
    
    # Start with staging environment
    ENV_FILE="$STAGING_ENV_FILE" PORT="$STAGING_PORT" NODE_ENV=staging nohup pnpm dev > "$STAGING_LOGS_DIR/server.log" 2>&1 &
    local server_pid=$!
    
    # Wait for server to start
    log "Waiting for server to start..."
    for i in {1..30}; do
        if curl -sf "http://localhost:$STAGING_PORT/health" > /dev/null 2>&1; then
            success "Staging server started on port $STAGING_PORT (PID: $server_pid)"
            echo "$server_pid" > "$STAGING_LOGS_DIR/server.pid"
            return 0
        fi
        sleep 1
    done
    
    error "Server failed to start within 30 seconds"
    exit 1
}

# Validate staging deployment
validate_staging_deployment() {
    log "Validating staging deployment..."
    
    # Health check
    if ! curl -sf "http://localhost:$STAGING_PORT/health" > /dev/null; then
        error "Health check failed"
        return 1
    fi
    
    # Check canary endpoints
    if ! curl -sf "http://localhost:$STAGING_PORT/canary/config" > /dev/null; then
        error "Canary config endpoint not accessible"
        return 1
    fi
    
    # Check JWKS endpoint
    if ! curl -sf "http://localhost:$STAGING_PORT/.well-known/jwks.json" > /dev/null; then
        warn "JWKS endpoint not accessible (may need to be implemented)"
    fi
    
    # Test canary phase change
    local admin_tokens=$(cat "$STAGING_KEYS_DIR/admin-tokens.json")
    local canary_token=$(echo "$admin_tokens" | jq -r '.canary_token')
    
    local phase_response=$(curl -s -X POST "http://localhost:$STAGING_PORT/canary/phase" \
        -H "Content-Type: application/json" \
        -d "{\"adminToken\":\"$canary_token\",\"phase\":\"canary_5\",\"reason\":\"Staging validation test\"}")
    
    if echo "$phase_response" | jq -e '.success' > /dev/null; then
        success "Canary phase change test passed"
        
        # Rollback to off
        curl -s -X POST "http://localhost:$STAGING_PORT/canary/phase" \
            -H "Content-Type: application/json" \
            -d "{\"adminToken\":\"$canary_token\",\"phase\":\"off\",\"reason\":\"Reset after test\"}" > /dev/null
    else
        warn "Canary phase change test failed: $phase_response"
    fi
    
    success "Staging deployment validation completed"
}

# Generate staging report
generate_staging_report() {
    log "Generating staging deployment report..."
    
    local report_file="$STAGING_LOGS_DIR/deployment-report-$(date +%Y%m%d-%H%M%S).json"
    local admin_tokens=$(cat "$STAGING_KEYS_DIR/admin-tokens.json")
    
    cat > "$report_file" << EOF
{
  "deployment": {
    "timestamp": "$(date -u -Iseconds)",
    "environment": "staging",
    "port": $STAGING_PORT,
    "status": "deployed"
  },
  "components": {
    "canary_controller": {
      "status": "active",
      "config_path": "$STAGING_CONFIG_DIR/canary.json",
      "phase": "off"
    },
    "key_rotation": {
      "status": "ready",
      "keys_generated": true,
      "jwks_endpoint": "http://localhost:$STAGING_PORT/.well-known/jwks.json"
    },
    "release_train": {
      "status": "configured",
      "staging_branch": "feat/zod-row-typing"
    },
    "slack_integration": {
      "channel": "#staging-canary-approvals",
      "status": "configured"
    }
  },
  "endpoints": {
    "health": "http://localhost:$STAGING_PORT/health",
    "canary_config": "http://localhost:$STAGING_PORT/canary/config",
    "canary_dashboard": "http://localhost:$STAGING_PORT/canary/dashboard",
    "canary_phase": "http://localhost:$STAGING_PORT/canary/phase",
    "canary_metrics": "http://localhost:$STAGING_PORT/canary/metrics",
    "canary_rollback": "http://localhost:$STAGING_PORT/canary/rollback",
    "jwks": "http://localhost:$STAGING_PORT/.well-known/jwks.json"
  },
  "credentials": {
    "admin_canary_token": "$(echo "$admin_tokens" | jq -r '.canary_token')",
    "admin_kill_switch_token": "$(echo "$admin_tokens" | jq -r '.kill_switch_token')",
    "note": "Full credentials stored in $STAGING_KEYS_DIR/admin-tokens.json"
  },
  "validation": {
    "health_check": "passed",
    "canary_endpoints": "passed",
    "key_generation": "passed",
    "database_init": "passed"
  }
}
EOF
    
    success "Staging deployment report generated: $report_file"
    echo
    echo "=== STAGING DEPLOYMENT SUMMARY ==="
    jq '.' "$report_file"
}

# Main deployment function
deploy_staging() {
    log "Starting verifd staging deployment..."
    
    check_dependencies
    create_staging_directories
    generate_staging_keys
    create_jwks_endpoint
    create_staging_env
    init_staging_database
    deploy_canary_config
    start_staging_server
    validate_staging_deployment
    generate_staging_report
    
    success "Staging deployment completed successfully!"
    
    echo
    echo "=== NEXT STEPS ==="
    echo "1. Set Slack environment variables:"
    echo "   export SLACK_STAGING_BOT_TOKEN=your-staging-bot-token"
    echo "   export SLACK_STAGING_SIGNING_SECRET=your-staging-signing-secret"
    echo
    echo "2. Test canary approval flow:"
    echo "   curl http://localhost:$STAGING_PORT/canary/dashboard"
    echo
    echo "3. Monitor logs:"
    echo "   tail -f $STAGING_LOGS_DIR/server.log"
    echo
    echo "4. Stop staging server:"
    echo "   kill \$(cat $STAGING_LOGS_DIR/server.pid)"
    echo
    echo "Server running on: http://localhost:$STAGING_PORT"
    echo "Admin tokens: $STAGING_KEYS_DIR/admin-tokens.json"
}

# Stop staging server
stop_staging() {
    log "Stopping staging server..."
    
    if [ -f "$STAGING_LOGS_DIR/server.pid" ]; then
        local pid=$(cat "$STAGING_LOGS_DIR/server.pid")
        if kill "$pid" 2>/dev/null; then
            success "Staging server stopped (PID: $pid)"
        else
            warn "Could not stop server with PID: $pid (may have already stopped)"
        fi
        rm -f "$STAGING_LOGS_DIR/server.pid"
    else
        pkill -f "PORT=$STAGING_PORT" || warn "No staging server found to stop"
    fi
}

# Clean staging environment
clean_staging() {
    log "Cleaning staging environment..."
    
    stop_staging
    
    read -p "Remove all staging data? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$STAGING_CONFIG_DIR"
        rm -rf "$STAGING_LOGS_DIR"
        rm -rf "$STAGING_KEYS_DIR"
        rm -f "$STAGING_DB"
        rm -f "$STAGING_ENV_FILE"
        success "Staging environment cleaned"
    else
        log "Staging data preserved"
    fi
}

# Command handling
case "${1:-deploy}" in
    "deploy")
        deploy_staging
        ;;
    "stop")
        stop_staging
        ;;
    "clean")
        clean_staging
        ;;
    "restart")
        stop_staging
        sleep 2
        start_staging_server
        validate_staging_deployment
        ;;
    "status")
        if curl -sf "http://localhost:$STAGING_PORT/health" > /dev/null; then
            success "Staging server is running on port $STAGING_PORT"
            curl -s "http://localhost:$STAGING_PORT/canary/dashboard" | jq '.currentPhase, .monitoring' || true
        else
            warn "Staging server is not running"
        fi
        ;;
    "logs")
        tail -f "$STAGING_LOGS_DIR/server.log"
        ;;
    "help"|"-h"|"--help")
        echo "Usage: $0 [command]"
        echo
        echo "Commands:"
        echo "  deploy   Deploy staging environment (default)"
        echo "  stop     Stop staging server"
        echo "  clean    Clean staging environment"
        echo "  restart  Restart staging server"
        echo "  status   Check staging server status"
        echo "  logs     View staging server logs"
        echo "  help     Show this help message"
        ;;
    *)
        error "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac