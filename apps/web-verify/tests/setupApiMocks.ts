import { Page } from '@playwright/test';

export async function setupApiMocks(page: Page) {
  // Only activate when MOCK_API=1 (CI) or when developer opts in
  if (process.env.MOCK_API !== '1') return;

  const now = new Date();
  const in15 = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  const in10 = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

  await page.route('**/verify/start', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'TEST123',
        code: 'TEST123',  // Keep for backward compatibility
        number_e164: '+12345678901',
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

  await page.route('**/pass/check**', async (route) => {
    // Return allowed=true when ?phone exists; else 400 (mirrors prod)
    const url = new URL(route.request().url());
    const phone = url.searchParams.get('phone');
    const status = phone ? 200 : 400;
    const body = phone
      ? { allowed: true, scope: 'outgoing', expiresAt: in10 }
      : { error: 'missing_phone' };
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}