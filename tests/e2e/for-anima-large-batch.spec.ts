import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Large-batch workflow tests:
 * - uploading big batches must not drop images (batched state updates)
 * - batches above the chunk size (25) upload in multiple POSTs so the
 *   server can start captioning before the whole batch arrives
 */

const ONE_PIXEL_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==",
  "base64"
);

async function goToForAnima(page: Page) {
  await page.route("**/api/ping*", (route) => {
    void route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Choose a Mode" })).toBeVisible({ timeout: 5000 });

  await page.route("**/api/models*", (route) => {
    void route.fulfill({ status: 200, body: JSON.stringify({ models: [{ id: "test-model" }] }) });
  });
  await page.getByRole("button", { name: "Start For Anima Mode", exact: true }).click();
  await expect(page.getByRole("heading", { name: "For Anima Mode" })).toBeVisible({ timeout: 5000 });
}

/** Static SSE body: session, then start+complete per image, then done. */
function makeSseBody(sessionId: string, count: number): string {
  let body = `event: session\ndata: ${JSON.stringify({ sessionId })}\n\n`;
  for (let i = 0; i < count; i++) {
    body += `event: image_start\ndata: ${JSON.stringify({ index: i, name: `img-${i}.jpg` })}\n\n`;
    body +=
      "event: image_complete\ndata: " +
      JSON.stringify({
        index: i,
        status: "completed",
        caption: `1girl, addition ${i}`,
        cachedTokens: 10,
        promptTokens: 100,
      }) +
      "\n\n";
  }
  return body + `event: done\ndata: ${JSON.stringify({ allComplete: true })}\n\n`;
}

async function uploadImages(page: Page, count: number) {
  await page.locator('input[type="file"]').setInputFiles(
    Array.from({ length: count }, (_, i) => ({
      name: `img-${i}.jpg`,
      mimeType: "image/jpeg",
      buffer: ONE_PIXEL_JPEG,
    }))
  );
}

test.describe("For Anima large batches", () => {
  test("shows a 30-image batch without dropping images", async ({ page }) => {
    await goToForAnima(page);
    await uploadImages(page, 30);
    await expect(page.getByText("30 images uploaded")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Continue (30 images)" })).toBeEnabled();
  });

  test("uploads a 30-image batch in 2 chunks and completes every result", async ({ page }) => {
    await goToForAnima(page);

    await page.route("**/api/tag*", (route) => {
      void route.fulfill({
        status: 200,
        body: JSON.stringify({ tags: ["1girl"], tagsWithProbs: [{ tag: "1girl", probability: 0.9 }] }),
      });
    });

    // Records which chunk each POST is; chunk 0 gets the SSE stream,
    // later chunks get a JSON ack.
    const seenChunks: number[] = [];
    await page.route("**/api/caption/for-anima*", (route) => {
      const body = route.request().postData() ?? "";
      const chunkMatch = body.match(/"chunkIndex":(\d+)/);
      if (chunkMatch) {
        const chunkIndex = Number(chunkMatch[1]);
        seenChunks.push(chunkIndex);
        if (chunkIndex === 0) {
          return route.fulfill({
            status: 200,
            headers: { "content-type": "text/event-stream" },
            body: makeSseBody("e2e-chunked-session", 30),
          });
        }
        return route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ok: true, accepted: 5, rejected: 0 }),
        });
      }
      // Legacy single-shot shape - answer anyway so the failure is the
      // chunk assertion, not a hung request.
      return route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: makeSseBody("e2e-legacy-session", 30),
      });
    });

    await uploadImages(page, 30);
    const cont = page.getByRole("button", { name: "Continue (30 images)" });
    await expect(cont).toBeEnabled({ timeout: 10_000 });
    await cont.click();

    await page.getByRole("button", { name: "Start Tagging" }).click();
    const toLlm = page.getByRole("button", { name: "Continue to LLM Tagging" });
    await expect(toLlm).toBeVisible({ timeout: 30_000 });
    await toLlm.click();

    const start = page.getByRole("button", { name: "Start Captioning" });
    await expect(start).toBeEnabled({ timeout: 10_000 });
    await start.click();

    await expect(page.getByText("30 completed,").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Download ZIP" })).toBeVisible();

    // The whole batch must have arrived as chunk 0 + chunk 1
    expect(seenChunks.slice().sort((a, b) => a - b)).toEqual([0, 1]);
  });
});
