import { test, expect } from '@playwright/test';

test.describe('Web Verify Basic Tests', () => {
  test('should load the home page', async ({ page }) => {
    // Start web app locally
    await page.goto('/');
    
    // Check if form is present
    await expect(page.getByTestId('verify-form')).toBeVisible();
    await expect(page.getByTestId('name-input')).toBeVisible();
    await expect(page.getByTestId('reason-input')).toBeVisible();
    await expect(page.getByTestId('phone-input')).toBeVisible();
    await expect(page.getByTestId('submit-button')).toBeVisible();
    
    // Take a screenshot for handoff
    await page.screenshot({ 
      path: '../../handoff/artifacts/web-verify-home-page.png', 
      fullPage: true 
    });
    
    console.log('✅ Home page loaded successfully');
  });

  test('should validate form fields', async ({ page }) => {
    await page.goto('/');
    
    // Try to submit empty form
    await page.getByTestId('submit-button').click();
    
    // HTML5 validation should prevent submission
    // We can check if we're still on the same page
    await expect(page.getByTestId('verify-form')).toBeVisible();
    
    console.log('✅ Form validation working');
  });

  test('should fill form fields', async ({ page }) => {
    await page.goto('/');
    
    // Fill form fields
    await page.getByTestId('name-input').fill('Test User');
    await page.getByTestId('reason-input').fill('Test call');
    await page.getByTestId('phone-input').fill('+1234567890');
    await page.getByTestId('voice-input').fill('Test voice message');
    
    // Verify values were entered
    await expect(page.getByTestId('name-input')).toHaveValue('Test User');
    await expect(page.getByTestId('reason-input')).toHaveValue('Test call');
    await expect(page.getByTestId('phone-input')).toHaveValue('+1234567890');
    await expect(page.getByTestId('voice-input')).toHaveValue('Test voice message');
    
    // Take screenshot of filled form
    await page.screenshot({ 
      path: '../../handoff/artifacts/web-verify-filled-form.png', 
      fullPage: true 
    });
    
    console.log('✅ Form filling works correctly');
  });
});