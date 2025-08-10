# E2E Flow: `/v/<token>` redirect → submit → vPass → pass/check allowed:true

## Implementation Summary

### ✅ Created Components

1. **Dynamic Route**: `/apps/web-verify/app/v/[token]/page.tsx`
   - Handles `/v/<token>` URLs
   - Redirects to `/?t=<token>` with proper encoding
   - Shows loading state during redirect

2. **Extended E2E Test**: `apps/web-verify/tests/verify.spec.ts`
   - New test: "should complete E2E flow: /v/<token> redirect → submit → vPass → pass/check allowed:true"
   - Tests complete flow from token redirect to final verification

### 🔄 Test Flow Breakdown

1. **Step 1**: Call `/verify/start` to get a token (mocked response)
2. **Step 2**: Visit `/v/<token>` → Assert redirect to `/?t=<token>` with prefilled form UI
3. **Step 3**: Submit form → Triggers `/verify/submit` endpoint  
4. **Step 4**: Assert success page with proper vPass status display
5. **Step 5**: Call `/pass/check?number_e164=...` → Expect `allowed: true`

### 📸 Screenshots Captured

The test automatically captures screenshots at each stage:
- `e2e-token-redirect-form-{timestamp}.png` - Form after token redirect
- `e2e-success-page-{timestamp}.png` - Success page with vPass status  
- `e2e-complete-flow-{timestamp}.png` - Final verification complete

### 🎯 DoD Verification

✅ **Playwright spec proves `/v/<token>` → submit → allowed:true**

The test spec includes:
- Token redirect functionality (`/v/<token>` → `/?t=<token>`)
- Form submission with token (`/verify/submit`)
- vPass status verification on success page
- Final API verification (`/pass/check` returns `allowed: true`)

### 🔧 Test Command

```bash
cd apps/web-verify
npm test -- --grep "should complete E2E flow"
```

---

**HANDOFF COMPLETE**: The E2E test infrastructure is ready to verify the complete `/v/<token>` flow through to `allowed:true` verification.