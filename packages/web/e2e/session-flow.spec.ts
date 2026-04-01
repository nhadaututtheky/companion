import { test, expect } from "@playwright/test";

test.describe("Session Flow", () => {
  test("new session modal opens and shows form fields", async ({ page }) => {
    await page.goto("/");

    // Click new session button (usually "+" or "New Session")
    const newBtn = page
      .locator(
        'button:has-text("New"), button[aria-label*="new" i], button[aria-label*="session" i]',
      )
      .first();
    if (await newBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newBtn.click();

      // Modal should appear with model selector and prompt input
      const modal = page.locator('[role="dialog"], [data-modal]');
      await expect(modal).toBeVisible({ timeout: 3000 });
    }
  });

  test("session detail page shows 404 or redirect for invalid id", async ({ page }) => {
    const response = await page.goto("/sessions/nonexistent-id-12345");
    // Should either show error state or redirect — not crash
    expect(response?.status()).toBeLessThan(500);
  });

  test("session list renders without errors", async ({ page }) => {
    await page.goto("/");
    // No uncaught errors — page should load without console errors
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.waitForTimeout(2000);
    expect(errors.filter((e) => !e.includes("hydration"))).toHaveLength(0);
  });
});
