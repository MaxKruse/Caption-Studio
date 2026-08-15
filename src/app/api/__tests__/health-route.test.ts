import { describe, it, expect } from "bun:test";
import { GET } from "@/app/api/health/route";

describe("health route", () => {
  it("returns 200 with health info", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(typeof data.tempDirWritable).toBe("boolean");
    expect(typeof data.tempDir).toBe("string");
    expect(typeof data.sessionsCount).toBe("number");
    expect(typeof data.uptime).toBe("number");
    expect(typeof data.requestId).toBe("string");
  });

  it("includes tempDir path", async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.tempDir).toBe("/tmp/caption-studio");
  });
});
