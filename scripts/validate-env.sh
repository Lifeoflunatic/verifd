#!/bin/bash

# Environment Variables Validation Script
# Usage: ./validate-env.sh [backend|web]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Required backend variables
REQUIRED_BACKEND=(
  "PORT"
  "NODE_ENV"
  "DATABASE_URL"
  "JWT_SECRET"
  "SWEEPER_SECRET"
  "CORS_ALLOWED_ORIGINS"
  "API_BASE_URL"
  "VERIFY_BASE_URL"
)

# Optional backend variables (warn if missing)
OPTIONAL_BACKEND=(
  "AWS_ACCESS_KEY_ID"
  "AWS_SECRET_ACCESS_KEY"
  "S3_BUCKET_NAME"
  "S3_PUBLIC_DOMAIN"
  "SENTRY_DSN"
)

# Required web variables
REQUIRED_WEB=(
  "NEXT_PUBLIC_API_BASE_URL"
)

# Optional web variables
OPTIONAL_WEB=(
  "SENTRY_DSN"
  "NEXT_PUBLIC_GA_ID"
)

validate_backend() {
  echo "🔍 Validating Backend Environment Variables"
  echo "==========================================="
  
  local missing=0
  local warnings=0
  
  # Check required
  echo -e "\n${YELLOW}Required Variables:${NC}"
  for var in "${REQUIRED_BACKEND[@]}"; do
    if [[ -z "${!var}" ]]; then
      echo -e "  ${RED}❌ $var - MISSING${NC}"
      ((missing++))
    else
      # Mask sensitive values
      if [[ "$var" == *"SECRET"* ]] || [[ "$var" == *"KEY"* ]]; then
        echo -e "  ${GREEN}✅ $var - [REDACTED]${NC}"
      else
        echo -e "  ${GREEN}✅ $var - ${!var}${NC}"
      fi
    fi
  done
  
  # Check optional
  echo -e "\n${YELLOW}Optional Variables:${NC}"
  for var in "${OPTIONAL_BACKEND[@]}"; do
    if [[ -z "${!var}" ]]; then
      echo -e "  ${YELLOW}⚠️  $var - Not configured${NC}"
      ((warnings++))
    else
      if [[ "$var" == *"SECRET"* ]] || [[ "$var" == *"KEY"* ]]; then
        echo -e "  ${GREEN}✅ $var - [REDACTED]${NC}"
      else
        echo -e "  ${GREEN}✅ $var - ${!var}${NC}"
      fi
    fi
  done
  
  # Summary
  echo -e "\n${YELLOW}Summary:${NC}"
  if [[ $missing -eq 0 ]]; then
    echo -e "  ${GREEN}✅ All required variables present${NC}"
  else
    echo -e "  ${RED}❌ $missing required variable(s) missing${NC}"
    exit 1
  fi
  
  if [[ $warnings -gt 0 ]]; then
    echo -e "  ${YELLOW}⚠️  $warnings optional variable(s) not configured${NC}"
  fi
  
  # Additional checks
  echo -e "\n${YELLOW}Security Checks:${NC}"
  
  # Check JWT_SECRET strength
  if [[ -n "$JWT_SECRET" ]] && [[ ${#JWT_SECRET} -lt 32 ]]; then
    echo -e "  ${YELLOW}⚠️  JWT_SECRET should be at least 32 characters${NC}"
  else
    echo -e "  ${GREEN}✅ JWT_SECRET length OK${NC}"
  fi
  
  # Check NODE_ENV
  if [[ "$NODE_ENV" == "production" ]] && [[ "$JWT_SECRET" == "dev-secret-change-me" ]]; then
    echo -e "  ${RED}❌ Using development JWT_SECRET in production!${NC}"
    exit 1
  else
    echo -e "  ${GREEN}✅ Environment-appropriate secrets${NC}"
  fi
}

validate_web() {
  echo "🔍 Validating Web Environment Variables"
  echo "======================================="
  
  local missing=0
  local warnings=0
  
  # Check required
  echo -e "\n${YELLOW}Required Variables:${NC}"
  for var in "${REQUIRED_WEB[@]}"; do
    if [[ -z "${!var}" ]]; then
      echo -e "  ${RED}❌ $var - MISSING${NC}"
      ((missing++))
    else
      echo -e "  ${GREEN}✅ $var - ${!var}${NC}"
    fi
  done
  
  # Check optional
  echo -e "\n${YELLOW}Optional Variables:${NC}"
  for var in "${OPTIONAL_WEB[@]}"; do
    if [[ -z "${!var}" ]]; then
      echo -e "  ${YELLOW}⚠️  $var - Not configured${NC}"
      ((warnings++))
    else
      echo -e "  ${GREEN}✅ $var - ${!var}${NC}"
    fi
  done
  
  # Summary
  echo -e "\n${YELLOW}Summary:${NC}"
  if [[ $missing -eq 0 ]]; then
    echo -e "  ${GREEN}✅ All required variables present${NC}"
  else
    echo -e "  ${RED}❌ $missing required variable(s) missing${NC}"
    exit 1
  fi
  
  if [[ $warnings -gt 0 ]]; then
    echo -e "  ${YELLOW}⚠️  $warnings optional variable(s) not configured${NC}"
  fi
  
  # URL validation
  echo -e "\n${YELLOW}URL Validation:${NC}"
  if [[ -n "$NEXT_PUBLIC_API_BASE_URL" ]]; then
    if curl -s -o /dev/null -w "%{http_code}" "$NEXT_PUBLIC_API_BASE_URL/healthz" | grep -q "200"; then
      echo -e "  ${GREEN}✅ Backend is reachable${NC}"
    else
      echo -e "  ${YELLOW}⚠️  Backend not reachable at $NEXT_PUBLIC_API_BASE_URL${NC}"
    fi
  fi
}

# Main
case "$1" in
  backend)
    # Load backend env if exists
    if [[ -f "apps/backend/.env" ]]; then
      source apps/backend/.env
    elif [[ -f ".env" ]]; then
      source .env
    fi
    validate_backend
    ;;
    
  web)
    # Load web env if exists
    if [[ -f "apps/web-verify/.env.local" ]]; then
      source apps/web-verify/.env.local
    elif [[ -f ".env.local" ]]; then
      source .env.local
    fi
    validate_web
    ;;
    
  all)
    $0 backend
    echo ""
    $0 web
    ;;
    
  *)
    echo "Usage: $0 [backend|web|all]"
    echo ""
    echo "Examples:"
    echo "  $0 backend   # Validate backend environment"
    echo "  $0 web       # Validate web environment"
    echo "  $0 all       # Validate both"
    exit 1
    ;;
esac