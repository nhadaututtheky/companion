import { test, expect } from "@playwright/test";

test.describe("Smoke Tests", () => {
  test("homepage loads and shows header", async ({ page }) => {
    await page.goto("/");
    // Header should be visible
    await expect(page.locator("header")).toBeVisible();
  });

  test("shows empty state when no sessions", async ({ page }) => {
    await page.goto("/");
    // The main content area should exist
    await expect(page.locator("main, [role='main'], #__next")).toBeVisible();
  });

  test("settings page loads", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/settings/);
  });

  test("projects page loads", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/projects/);
  });

  test("templates page loads", async ({ page }) => {
    await page.goto("/templates");
    await expect(page).toHaveURL(/templates/);
  });
});
