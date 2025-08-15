#!/bin/bash

# S3/R2 Lifecycle and CORS Configuration Script
# Safe to run multiple times (idempotent)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 verifd Object Storage Configuration"
echo "======================================"

# Check for AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found${NC}"
    echo "Install with: brew install awscli"
    exit 1
fi

# Configuration
BUCKET_NAME="${S3_BUCKET_NAME:-verifd-voices}"
REGION="${AWS_REGION:-us-east-1}"

echo -e "${YELLOW}📦 Bucket: ${BUCKET_NAME}${NC}"
echo -e "${YELLOW}🌍 Region: ${REGION}${NC}"
echo ""

# Create temporary files
CORS_FILE=$(mktemp)
LIFECYCLE_FILE=$(mktemp)

# Clean up on exit
trap "rm -f ${CORS_FILE} ${LIFECYCLE_FILE}" EXIT

# Write CORS configuration
cat > ${CORS_FILE} << 'EOF'
[{
  "AllowedOrigins": [
    "https://verify.getpryvacy.com",
    "https://verifd-web-verify-*.vercel.app"
  ],
  "AllowedMethods": ["POST", "PUT"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": [],
  "MaxAgeSeconds": 300
}]
EOF

# Write Lifecycle configuration
cat > ${LIFECYCLE_FILE} << 'EOF'
{
  "Rules": [{
    "ID": "expire-voice-24h",
    "Status": "Enabled",
    "Filter": { "Prefix": "voice/" },
    "Expiration": { "Days": 1 }
  }]
}
EOF

# Function to check if bucket exists
check_bucket() {
    if aws s3api head-bucket --bucket "${BUCKET_NAME}" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to apply CORS
apply_cors() {
    echo "🔒 Applying CORS policy..."
    if aws s3api put-bucket-cors \
        --bucket "${BUCKET_NAME}" \
        --cors-configuration "file://${CORS_FILE}" 2>/dev/null; then
        echo -e "${GREEN}✅ CORS policy applied successfully${NC}"
        return 0
    else
        echo -e "${RED}❌ Failed to apply CORS policy${NC}"
        return 1
    fi
}

# Function to apply Lifecycle
apply_lifecycle() {
    echo "⏰ Applying lifecycle policy (24h retention)..."
    if aws s3api put-bucket-lifecycle-configuration \
        --bucket "${BUCKET_NAME}" \
        --lifecycle-configuration "file://${LIFECYCLE_FILE}" 2>/dev/null; then
        echo -e "${GREEN}✅ Lifecycle policy applied successfully${NC}"
        return 0
    else
        echo -e "${RED}❌ Failed to apply lifecycle policy${NC}"
        return 1
    fi
}

# Function to verify configuration
verify_config() {
    echo ""
    echo "🔍 Verifying configuration..."
    
    # Check CORS
    echo -n "  CORS: "
    if aws s3api get-bucket-cors --bucket "${BUCKET_NAME}" &>/dev/null; then
        echo -e "${GREEN}configured${NC}"
    else
        echo -e "${YELLOW}not configured${NC}"
    fi
    
    # Check Lifecycle
    echo -n "  Lifecycle: "
    if aws s3api get-bucket-lifecycle-configuration --bucket "${BUCKET_NAME}" &>/dev/null; then
        echo -e "${GREEN}configured${NC}"
    else
        echo -e "${YELLOW}not configured${NC}"
    fi
}

# Main execution
main() {
    # Check if bucket exists
    if ! check_bucket; then
        echo -e "${YELLOW}⚠️  Bucket ${BUCKET_NAME} does not exist${NC}"
        echo -n "Create bucket? (y/n): "
        read -r response
        if [[ "$response" == "y" ]]; then
            echo "Creating bucket..."
            if aws s3 mb "s3://${BUCKET_NAME}" --region "${REGION}"; then
                echo -e "${GREEN}✅ Bucket created${NC}"
            else
                echo -e "${RED}❌ Failed to create bucket${NC}"
                exit 1
            fi
        else
            echo "Exiting..."
            exit 0
        fi
    else
        echo -e "${GREEN}✅ Bucket exists${NC}"
    fi
    
    echo ""
    
    # Apply configurations
    apply_cors
    apply_lifecycle
    
    # Verify
    verify_config
    
    echo ""
    echo -e "${GREEN}🎉 Configuration complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Set environment variables in your .env file:"
    echo "   AWS_REGION=${REGION}"
    echo "   AWS_ACCESS_KEY_ID=your-key-id"
    echo "   AWS_SECRET_ACCESS_KEY=your-secret"
    echo "   S3_BUCKET_NAME=${BUCKET_NAME}"
    echo ""
    echo "2. Test upload with:"
    echo "   curl -X POST http://localhost:3002/upload/presigned \\"
    echo "     -H 'Content-Type: application/json' \\"
    echo "     -d '{\"contentType\": \"audio/webm\"}'"
}

# Run main function
main

# For R2 users
echo ""
echo "📘 For Cloudflare R2:"
echo "   Configure via dashboard: https://dash.cloudflare.com/"
echo "   - Go to R2 > ${BUCKET_NAME} > Settings"
echo "   - Set CORS and Lifecycle rules as shown above"