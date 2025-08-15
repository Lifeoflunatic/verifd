# Object Storage Configuration

## Overview

Voice recordings are stored in S3 or Cloudflare R2 with:
- **24-hour auto-expiration** for privacy
- **Strict CORS** allowing only production and preview domains
- **Minimal retention** to reduce storage costs

## AWS S3 Configuration

### 1. Create Bucket

```bash
aws s3 mb s3://verifd-voices --region us-east-1
```

### 2. Apply CORS Policy

Save as `s3-cors.json`:
```json
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
```

Apply:
```bash
aws s3api put-bucket-cors \
  --bucket verifd-voices \
  --cors-configuration file://s3-cors.json
```

### 3. Apply Lifecycle Policy

Save as `s3-lifecycle.json`:
```json
{
  "Rules": [{
    "ID": "expire-voice-24h",
    "Status": "Enabled",
    "Filter": { "Prefix": "voice/" },
    "Expiration": { "Days": 1 }
  }]
}
```

Apply:
```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket verifd-voices \
  --lifecycle-configuration file://s3-lifecycle.json
```

### 4. Set Bucket Policy (Optional - for CDN)

Save as `s3-bucket-policy.json`:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::verifd-voices/*",
    "Condition": {
      "StringLike": {
        "aws:Referer": [
          "https://verify.getpryvacy.com/*",
          "https://verifd-web-verify-*.vercel.app/*"
        ]
      }
    }
  }]
}
```

Apply:
```bash
aws s3api put-bucket-policy \
  --bucket verifd-voices \
  --policy file://s3-bucket-policy.json
```

## Cloudflare R2 Configuration

### 1. Create Bucket

```bash
wrangler r2 bucket create verifd-voices
```

### 2. Apply CORS Rules

Via Cloudflare Dashboard:
1. Go to R2 > verifd-voices > Settings > CORS
2. Add rule:
   - Allowed Origins: `https://verify.getpryvacy.com, https://verifd-web-verify-*.vercel.app`
   - Allowed Methods: `POST, PUT`
   - Allowed Headers: `*`
   - Max Age: `300`

Or via API:
```bash
# R2 CORS is configured via dashboard or Workers
# See: https://developers.cloudflare.com/r2/buckets/cors/
```

### 3. Apply Lifecycle Rules

Via Cloudflare Dashboard:
1. Go to R2 > verifd-voices > Settings > Lifecycle rules
2. Add rule:
   - Rule name: `expire-voice-24h`
   - Prefix: `voice/`
   - Delete after: `1 day`

### 4. Set up R2 Public Access (Optional)

```bash
wrangler r2 bucket update verifd-voices --public
```

## Environment Variables

### Backend (.env)

```bash
# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<AWS_ACCESS_KEY_ID>      # NEVER commit real keys
AWS_SECRET_ACCESS_KEY=<AWS_SECRET_ACCESS_KEY>
S3_BUCKET_NAME=verifd-voices
S3_PUBLIC_DOMAIN=https://verifd-voices.s3.amazonaws.com

# OR Cloudflare R2
R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
R2_BUCKET_NAME=verifd-voices
R2_PUBLIC_DOMAIN=https://voices.getpryvacy.com
AWS_ACCESS_KEY_ID=... # R2 access key
AWS_SECRET_ACCESS_KEY=... # R2 secret key
```

## Verification

### Test CORS
```bash
curl -I -X OPTIONS \
  -H "Origin: https://verify.getpryvacy.com" \
  -H "Access-Control-Request-Method: PUT" \
  https://verifd-voices.s3.amazonaws.com/test
```

### Test Upload (via presigned URL)
```bash
# Get presigned URL from backend
curl -X POST https://api.getpryvacy.com/upload/presigned \
  -H "Content-Type: application/json" \
  -d '{"contentType": "audio/webm"}'

# Upload file using presigned URL
curl -X PUT [presigned-url] \
  -H "Content-Type: audio/webm" \
  --data-binary @voice.webm
```

### Verify Lifecycle
```bash
# List objects older than 24h (should be empty)
aws s3 ls s3://verifd-voices/voice/ \
  --recursive \
  --query "Contents[?LastModified<='$(date -u -d '1 day ago' '+%Y-%m-%dT%H:%M:%S')']"
```

## Security Notes

1. **Never commit credentials** - Use environment variables
2. **Rotate access keys** quarterly
3. **Monitor usage** via CloudWatch/R2 Analytics
4. **Set up alerts** for unusual upload patterns
5. **Use IAM policies** with minimal permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "s3:PutObject",
      "s3:PutObjectAcl",
      "s3:GetObject"
    ],
    "Resource": "arn:aws:s3:::verifd-voices/voice/*"
  }]
}
```

## Troubleshooting

### CORS Errors
- Check browser console for specific CORS error
- Verify origin is in allowed list
- Check preflight OPTIONS response

### Upload Failures
- Verify presigned URL hasn't expired (5 min TTL)
- Check file size < 750KB
- Ensure correct Content-Type header

### Lifecycle Not Working
- Wait 24h for initial rule application
- Check CloudWatch/R2 metrics for deletion events
- Verify prefix matches exactly (`voice/`)