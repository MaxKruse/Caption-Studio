import { test, expect } from "@playwright/test";

test.describe("App Header", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/ping*", (route) => {
      void route.fulfill({
        status: 200,
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/");
    await expect(page.getByRole("button", { name: "Next" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Choose a Mode" })).toBeVisible({ timeout: 5000 });
  });

  test("shows app title", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Caption Studio" })).toBeVisible();
  });

  test("does not show 'New session' button on mode selector", async ({ page }) => {
    await expect(page.getByRole("button", { name: "New session" })).not.toBeVisible();
  });
});
