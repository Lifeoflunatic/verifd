import { Page } from '@playwright/test';

export async function setupApiMocks(page: Page) {
  // Only activate when MOCK_API=1 (CI) or when developer opts in
  if (process.env.MOCK_API !== '1') return;

  const now = new Date();
  const in15 = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  const in10 = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

  await page.route('**/verify/start', async (route) => {
    // Extract phone number from request body
    const requestBody = route.request().postDataJSON();
    const phoneNumber = requestBody?.phoneNumber || '+12345678901';
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'TEST123',
        code: 'TEST123',  // Keep for backward compatibility
        number_e164: phoneNumber,
        vanity_url: 'https://example.com/v/TEST123',
        expiresAt: in15,
      }),
    });
  });

  await page.route('**/verify/submit', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        passGranted: true,
        passId: 'pass_123',
        callerName: 'Test User',
        pass: {
          allowed: true,
          scope: 'outgoing',
          expiresAt: in10,
        },
      }),
    });
  });

  // Mock the /verify/{code} status check endpoint (but not /verify/start or /verify/submit)
  await page.route(/.*\/verify\/(?!start|submit)[^/?]+$/, async (route) => {
    // Extract code from URL
    const url = route.request().url();
    const codeMatch = url.match(/\/verify\/([^/?]+)$/);
    const code = codeMatch ? codeMatch[1] : 'TEST123';
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'verified',
        name: 'John Doe',
        reason: 'Test verification call',
        code: code,
        expiresAt: in15,
      }),
    });
  });

  await page.route('**/pass/check**', async (route) => {
    // Return allowed=true when ?phone, ?number, or ?number_e164 exists; else 400 (mirrors prod)
    const url = new URL(route.request().url());
    const phone = url.searchParams.get('phone') || url.searchParams.get('number') || url.searchParams.get('number_e164');
    
    if (!phone) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'missing_phone' }),
      });
      return;
    }
    
    // Different responses based on phone number to test different scenarios
    // Simple logic: if phone contains '987654321' or '555000000', no pass
    // Otherwise, active pass
    const hasNoPass = phone.includes('987654321') || phone.includes('555000000');
    
    const body = hasNoPass
      ? { allowed: false }
      : { allowed: true, scope: '30m', expires_at: in10, granted_to_name: 'John Doe', reason: 'Test verification call' }
      
      
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}