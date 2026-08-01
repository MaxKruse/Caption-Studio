import { test, expect } from "@playwright/test";

/**
 * Shared fixture to bypass the server check and land on the mode selector.
 */
async function goToModeSelector(page: import("@playwright/test").Page) {
  // Intercept ping BEFORE navigation so the auto-poll succeeds immediately
  await page.route("**/api/ping*", (route) => {
    void route.fulfill({
      status: 200,
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/");

  // Wait for server check to show "Next" button
  await expect(page.getByRole("button", { name: "Next" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Next" }).click();

  // Now the mode selector should be visible
  await expect(page.getByRole("heading", { name: "Choose a Mode" })).toBeVisible({ timeout: 5000 });
}

test.describe("Mode Selector", () => {
  test.beforeEach(async ({ page }) => {
    await goToModeSelector(page);
  });

  test("shows both mode cards", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "For Anima Mode" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Krea 2 Mode" })).toBeVisible();
  });

  test("does not show Simple or Multi-step modes", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Simple Mode" })).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Multi-step Mode" })).not.toBeVisible();
  });

  test("For Anima card has correct description", async ({ page }) => {
    await expect(page.getByText("Upload images + caption files")).toBeVisible();
    await expect(page.getByText("LLM generates natural language additions")).toBeVisible();
    await expect(page.getByText("Final caption = tags + LLM addition")).toBeVisible();
  });

  test("Krea 2 card has correct 3-phase description", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Krea 2 Mode" })).toBeVisible();

    // Check it mentions three phases
    await expect(page.getByText("Phase 1: caption each image individually")).toBeVisible();
    await expect(page.getByText("Phase 2: per-image refinement")).toBeVisible();
    await expect(page.getByText("Phase 3: distill")).toBeVisible();
  });

  test("navigates to For Anima mode on selection", async ({ page }) => {
    await page.route("**/api/models*", (route) => {
      void route.fulfill({
        status: 200,
        body: JSON.stringify({ models: [] }),
      });
    });

    await page.getByRole("button", { name: "Start For Anima Mode", exact: true }).click();
    await expect(page.getByRole("heading", { name: "For Anima Mode" })).toBeVisible({ timeout: 5000 });
  });

  test("navigates to Krea 2 mode on selection", async ({ page }) => {
    await page.route("**/api/models*", (route) => {
      void route.fulfill({
        status: 200,
        body: JSON.stringify({ models: [] }),
      });
    });

    await page.getByRole("button", { name: "Start Krea 2 Mode", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Krea 2 Mode" })).toBeVisible({ timeout: 5000 });
  });
});
