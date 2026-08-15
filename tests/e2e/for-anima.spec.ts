import { test, expect } from "@playwright/test";

async function goToForAnima(page: import("@playwright/test").Page) {
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

  await page.getByRole("button", { name: "Start For Anima Mode", exact: true }).click();
  await expect(page.getByRole("heading", { name: "For Anima Mode" })).toBeVisible({ timeout: 5000 });
}

test.describe("For Anima Mode", () => {
  test.beforeEach(async ({ page }) => {
    await goToForAnima(page);
  });

  test("shows upload phase first", async ({ page }) => {
    await expect(page.getByText("Upload Images")).toBeVisible();
    await expect(page.getByText("Drag & drop images here")).toBeVisible();
  });

  test("phase indicator shows all phases", async ({ page }) => {
    await expect(page.getByText("upload", { exact: true })).toBeVisible();
    await expect(page.getByText("tag", { exact: true })).toBeVisible();
    await expect(page.getByText("review tags")).toBeVisible();
    await expect(page.getByText("configure LLM")).toBeVisible();
    await expect(page.getByText("processing", { exact: true })).toBeVisible();
    await expect(page.getByText("results", { exact: true })).toBeVisible();
  });

  test("subtitle mentions auto-tag and LLM", async ({ page }) => {
    await expect(page.getByText("Auto-tag with WD Tagger, then enhance with LLM")).toBeVisible();
  });

  test("back button returns to mode selector", async ({ page }) => {
    await page.getByRole("button", { name: "Back to modes" }).click();
    await expect(page.getByRole("heading", { name: "Choose a Mode" })).toBeVisible({ timeout: 5000 });
  });

  test("tag review warns when images produced no tags", async ({ page }) => {
    // Tag service returns empty tag lists for every image
    await page.route("**/api/tag*", (route) => {
      void route.fulfill({
        status: 200,
        body: JSON.stringify({ tags: [], tagsWithProbs: [] }),
      });
    });

    const onePixelJpeg = Buffer.from(
      "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==",
      "base64"
    );

    await page.locator('input[type="file"]').setInputFiles([
      { name: "a.jpg", mimeType: "image/jpeg", buffer: onePixelJpeg },
      { name: "b.jpg", mimeType: "image/jpeg", buffer: onePixelJpeg },
    ]);

    const continueBtn = page.getByRole("button", { name: "Continue (2 images)" });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();
    await page.getByRole("button", { name: "Start Tagging" }).click();

    // Review phase lands and warns about the tagless images
    await expect(page.getByText("2 of 2 images have no tags")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("No tags generated")).toHaveCount(2);
  });
});
