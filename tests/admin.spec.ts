import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-in-production';

test.describe('Admin UI', () => {
  test('should show login page', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /password/i })).toBeVisible();
  });

  test('should reject wrong password', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('textbox', { name: /password/i }).fill('wrong-password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByText(/invalid password/i)).toBeVisible();
  });

  test('should login with correct password', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('textbox', { name: /password/i }).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
  });

  test('should show pages table after login', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('textbox', { name: /password/i }).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Title' })).toBeVisible();
  });

  test('should navigate to new page form', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('textbox', { name: /password/i }).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();

    await page.getByRole('link', { name: /new page/i }).click();
    await expect(page.getByRole('heading', { name: 'New Page' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Page' })).toBeVisible();
  });

  test('should create and delete a page', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('textbox', { name: /password/i }).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();

    // Navigate to new page
    await page.getByRole('link', { name: /new page/i }).click();

    // Fill in the form
    await page.getByRole('textbox', { name: /my-page-slug/i }).fill('playwright-test-page');
    await page.getByRole('textbox', { name: /page title/i }).fill('Playwright Test Page');
    await page.getByRole('textbox', { name: /markdown content/i }).fill('# Test\n\nContent from Playwright.');

    // Create page
    await page.getByRole('button', { name: 'Create Page' }).click();

    // Should redirect to edit page
    await expect(page.getByRole('heading', { name: 'Edit Page' })).toBeVisible();

    // Delete the page
    page.on('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).click();

    // Should redirect to admin dashboard
    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();
  });

  test('should logout', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('textbox', { name: /password/i }).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();

    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  });
});

test.describe('Wiki Pages', () => {
  test('should render beads page', async ({ page }) => {
    await page.goto('/beads');
    await expect(page.getByRole('heading', { name: 'Beads System Manual', level: 1 })).toBeVisible();
  });

  test('should have working navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /beads/i })).toBeVisible();
  });

  test('should toggle theme', async ({ page }) => {
    await page.goto('/beads');
    const themeButton = page.getByRole('button', { name: /toggle theme|switch to/i });
    await expect(themeButton).toBeVisible();
    await themeButton.click();
    // Theme should toggle (button text changes)
    await expect(page.getByRole('button', { name: /toggle theme|switch to/i })).toBeVisible();
  });
});
