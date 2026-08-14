import { test, expect } from "@playwright/test";

async function goToKrea2(page: import("@playwright/test").Page) {
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

  await page.route("**/api/models*", (route) => {
    void route.fulfill({
      status: 200,
      body: JSON.stringify({ models: [] }),
    });
  });

  await page.getByRole("button", { name: "Start Krea 2 Mode", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Krea 2 Mode" })).toBeVisible({ timeout: 5000 });
}

test.describe("Krea 2 Mode", () => {
  test.beforeEach(async ({ page }) => {
    await goToKrea2(page);
  });

  test("shows upload phase first", async ({ page }) => {
    await expect(page.getByText("Upload Images")).toBeVisible();
  });

  test("phase indicator shows all phases", async ({ page }) => {
    await expect(page.getByText("upload", { exact: true })).toBeVisible();
    await expect(page.getByText("configure", { exact: true })).toBeVisible();
    await expect(page.getByText("processing", { exact: true })).toBeVisible();
    await expect(page.getByText("results", { exact: true })).toBeVisible();
  });

  test("subtitle mentions three phases", async ({ page }) => {
    await expect(page.getByText("Caption, refine, and distill for krea2 prompts")).toBeVisible();
  });

  test("back button returns to mode selector", async ({ page }) => {
    await page.getByRole("button", { name: "Back to modes" }).click();
    await expect(page.getByRole("heading", { name: "Choose a Mode" })).toBeVisible({ timeout: 5000 });
  });

  test("uploading images does not log React render-phase update warnings", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const onePixelJpeg = Buffer.from(
      "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==",
      "base64"
    );

    await page.locator('input[type="file"]').setInputFiles({
      name: "pixel.jpg",
      mimeType: "image/jpeg",
      buffer: onePixelJpeg,
    });

    await expect(page.getByText("1 image uploaded")).toBeVisible();
    // Give React time to flush render-phase warnings to the console
    await page.waitForTimeout(300);

    const renderPhaseWarnings = consoleErrors.filter((e) =>
      e.includes("Cannot update a component")
    );
    expect(renderPhaseWarnings).toHaveLength(0);
  });
});
