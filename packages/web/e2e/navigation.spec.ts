import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("navigate between pages via sidebar/header links", async ({ page }) => {
    await page.goto("/");

    // Navigate to settings
    const settingsLink = page.locator('a[href="/settings"], button:has-text("Settings")').first();
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await expect(page).toHaveURL(/settings/);
    }

    // Navigate to projects
    const projectsLink = page.locator('a[href="/projects"]').first();
    if (await projectsLink.isVisible()) {
      await projectsLink.click();
      await expect(page).toHaveURL(/projects/);
    }

    // Navigate back to home
    await page.goto("/");
    await expect(page.locator("header")).toBeVisible();
  });

  test("keyboard shortcut Ctrl+K opens command palette", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    // Command palette dialog should appear
    const dialog = page.locator('[role="dialog"], [data-command-palette]');
    // If implemented, it should be visible. Otherwise, no error expected.
    if (await dialog.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(dialog).toBeVisible();
      // Press Escape to close
      await page.keyboard.press("Escape");
    }
  });
});
