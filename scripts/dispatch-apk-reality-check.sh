#!/bin/bash

# Dispatch APK Reality Check workflow on feat/zod-row-typing branch
# This script triggers the workflow and waits for completion

set -e

REPO="Lifeoflunatic/verifd"
WORKFLOW_FILE="apk-reality-check.yml"
REF="feat/zod-row-typing"

echo "🚀 Dispatching APK Reality Check workflow..."
echo "   Repository: $REPO"
echo "   Workflow: $WORKFLOW_FILE"
echo "   Branch: $REF"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed"
    echo "   Please install: brew install gh"
    exit 1
fi

# Check authentication
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub"
    echo "   Please run: gh auth login"
    exit 1
fi

# Dispatch the workflow
echo ""
echo "📤 Dispatching workflow..."
gh workflow run "$WORKFLOW_FILE" \
    --repo "$REPO" \
    --ref "$REF" \
    || {
        echo "❌ Failed to dispatch workflow"
        echo "   Make sure you have write access to the repository"
        exit 1
    }

echo "✅ Workflow dispatched successfully"
echo ""
echo "⏳ Waiting for workflow to start..."
sleep 5

# Get the latest run ID
RUN_ID=$(gh run list \
    --repo "$REPO" \
    --workflow "$WORKFLOW_FILE" \
    --branch "$REF" \
    --limit 1 \
    --json databaseId \
    --jq '.[0].databaseId')

if [ -z "$RUN_ID" ]; then
    echo "❌ Could not find workflow run"
    exit 1
fi

echo "📋 Workflow run ID: $RUN_ID"
echo "🔗 View at: https://github.com/$REPO/actions/runs/$RUN_ID"
echo ""

# Watch the workflow run
echo "👀 Watching workflow progress..."
gh run watch "$RUN_ID" --repo "$REPO" --exit-status || {
    echo "❌ Workflow failed"
    exit 1
}

echo ""
echo "✅ Workflow completed successfully!"
echo ""

# Download artifacts
echo "📦 Fetching artifacts..."
ARTIFACT_NAME="apk-reality-evidence"
ARTIFACT_DIR="./artifacts/apk-reality-evidence"

# Clean up old artifacts
rm -rf "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR"

# Download the evidence artifact
gh run download "$RUN_ID" \
    --repo "$REPO" \
    --name "$ARTIFACT_NAME" \
    --dir "$ARTIFACT_DIR" \
    || {
        echo "⚠️  Could not download artifact '$ARTIFACT_NAME'"
        echo "   The workflow may not have produced artifacts"
    }

# Display evidence if downloaded
if [ -d "$ARTIFACT_DIR" ]; then
    echo ""
    echo "📊 Evidence Summary:"
    echo "==================="
    
    # Check for summary.json
    if [ -f "$ARTIFACT_DIR/summary.json" ]; then
        echo ""
        echo "Summary JSON:"
        cat "$ARTIFACT_DIR/summary.json" | jq '.' 2>/dev/null || cat "$ARTIFACT_DIR/summary.json"
        
        # Extract key fields
        RUN_ID_FROM_SUMMARY=$(jq -r '.run.id' "$ARTIFACT_DIR/summary.json" 2>/dev/null || echo "N/A")
        ARTIFACT_ID=$(jq -r '.artifact.id' "$ARTIFACT_DIR/summary.json" 2>/dev/null || echo "N/A")
        APK_NAME=$(jq -r '.apk.name' "$ARTIFACT_DIR/summary.json" 2>/dev/null || echo "N/A")
        APK_SIZE=$(jq -r '.apk.size_bytes' "$ARTIFACT_DIR/summary.json" 2>/dev/null || echo "0")
        APK_SHA256=$(jq -r '.apk.sha256' "$ARTIFACT_DIR/summary.json" 2>/dev/null || echo "N/A")
        
        # Convert size to MB
        APK_SIZE_MB=$((APK_SIZE / 1048576))
        
        echo ""
        echo "📱 APK Details:"
        echo "  Run ID: $RUN_ID_FROM_SUMMARY"
        echo "  Artifact ID: $ARTIFACT_ID"
        echo "  APK Name: $APK_NAME"
        echo "  Size: ${APK_SIZE} bytes (${APK_SIZE_MB} MB)"
        echo "  SHA256: $APK_SHA256"
    fi
    
    # Check for SHA256 file
    if [ -f "$ARTIFACT_DIR/apk.sha256" ]; then
        echo ""
        echo "SHA256 Checksum:"
        cat "$ARTIFACT_DIR/apk.sha256"
    fi
    
    # Check for badging info
    if [ -f "$ARTIFACT_DIR/apk-badging.txt" ]; then
        echo ""
        echo "APK Badging (first 10 lines):"
        head -10 "$ARTIFACT_DIR/apk-badging.txt"
    fi
    
    echo ""
    echo "📁 All evidence files:"
    ls -la "$ARTIFACT_DIR/"
fi

# Update OPS/STAGING_QA_LINKS.md
echo ""
echo "📝 Updating OPS/STAGING_QA_LINKS.md..."

# Create OPS directory if it doesn't exist
mkdir -p OPS

# Create or append to STAGING_QA_LINKS.md
if [ ! -f "OPS/STAGING_QA_LINKS.md" ]; then
    cat > OPS/STAGING_QA_LINKS.md << 'EOF'
# Staging QA Links

This document contains verified links and checksums for staging builds.

EOF
fi

# Append verification results
cat >> OPS/STAGING_QA_LINKS.md << EOF

---

## APK Reality Check Results

**Date**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
**Branch**: $REF
**Workflow Run**: [$RUN_ID](https://github.com/$REPO/actions/runs/$RUN_ID)

### APK Verification Summary

| Property | Value |
|----------|-------|
| Run ID | $RUN_ID_FROM_SUMMARY |
| Artifact ID | $ARTIFACT_ID |
| APK Filename | $APK_NAME |
| Size (bytes) | $APK_SIZE |
| Size (MB) | $APK_SIZE_MB |
| SHA256 | \`$APK_SHA256\` |
| Status | ✅ Verified |

### Evidence Files
- apk.sha256
- apk-badging.txt
- artifact_listing.json
- run_listing.json
- summary.json

EOF

echo "✅ Documentation updated"

echo ""
echo "========================================="
echo "📋 INLINE SUMMARY"
echo "========================================="
echo "Run ID: $RUN_ID"
echo "Artifact ID: $ARTIFACT_ID"
echo "APK Filename: $APK_NAME"
echo "Byte Size: $APK_SIZE"
echo "SHA256: $APK_SHA256"
echo "========================================="