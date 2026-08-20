import { describe, it, expect } from "bun:test";
import { krea2ConfigSchema, forAnimaConfigSchema } from "@/lib/config-schema";

describe("config schema validation", () => {
  describe("krea2ConfigSchema", () => {
    it("accepts valid config", () => {
      const config = {
        serverUrl: "http://localhost:8080",
        model: "gemma-3",
        systemPrompt: "You are helpful",
        userPrompt: "Describe",
        triggerWordPerson: "person",
        triggerWordOther: "other",
        characterDescription: "A woman",
      };
      const result = krea2ConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("rejects missing serverUrl", () => {
      const config = { model: "gemma", characterDescription: "desc" };
      const result = krea2ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("rejects missing characterDescription", () => {
      const config = { serverUrl: "http://localhost", model: "gemma" };
      const result = krea2ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("provides defaults for optional fields", () => {
      const config = { serverUrl: "http://localhost", model: "gemma", characterDescription: "desc" };
      const result = krea2ConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.systemPrompt).toBe("");
        expect(result.data.userPrompt).toBe("");
      }
    });
  });

  describe("forAnimaConfigSchema", () => {
    it("accepts valid config", () => {
      const config = {
        serverUrl: "http://localhost:8080",
        model: "gemma-3",
        systemPrompt: "You are helpful",
        userPrompt: "Describe",
      };
      const result = forAnimaConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("rejects missing serverUrl", () => {
      const config = { model: "gemma" };
      const result = forAnimaConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe("maxImageDimension", () => {
    it("is optional in both schemas (defaults to the 1536 lib default)", () => {
      const krea2 = krea2ConfigSchema.safeParse({
        serverUrl: "http://localhost",
        model: "m",
        characterDescription: "d",
      });
      const anima = forAnimaConfigSchema.safeParse({
        serverUrl: "http://localhost",
        model: "m",
      });
      expect(krea2.success).toBe(true);
      expect(anima.success).toBe(true);
      if (krea2.success) expect(krea2.data.maxImageDimension).toBeUndefined();
      if (anima.success) expect(anima.data.maxImageDimension).toBeUndefined();
    });

    it("accepts a positive integer within the allowed range", () => {
      const config = {
        serverUrl: "http://localhost",
        model: "m",
        characterDescription: "d",
        maxImageDimension: 2048,
      };
      const result = krea2ConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.maxImageDimension).toBe(2048);
    });

    it("rejects non-integer, zero, negative, and out-of-range values", () => {
      const base = { serverUrl: "http://localhost", model: "m", characterDescription: "d" };
      for (const bad of [102.5, 0, -256, 100, 9999]) {
        const result = krea2ConfigSchema.safeParse({ ...base, maxImageDimension: bad });
        expect(result.success).toBe(false);
      }
    });
  });

  describe("chunked upload fields", () => {
    const base = { serverUrl: "http://localhost", model: "m" };
    const chunkFields = {
      sessionId: "11111111-2222-4333-8444-555555555555",
      expectedImageCount: 700,
      chunkIndex: 1,
      chunkSize: 25,
    };

    it("accepts chunk fields in the for-anima config", () => {
      const result = forAnimaConfigSchema.safeParse({ ...base, ...chunkFields });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sessionId).toBe(chunkFields.sessionId);
        expect(result.data.expectedImageCount).toBe(700);
        expect(result.data.chunkIndex).toBe(1);
        expect(result.data.chunkSize).toBe(25);
      }
    });

    it("leaves chunk fields undefined when absent", () => {
      const result = forAnimaConfigSchema.safeParse(base);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sessionId).toBeUndefined();
        expect(result.data.expectedImageCount).toBeUndefined();
        expect(result.data.chunkIndex).toBeUndefined();
        expect(result.data.chunkSize).toBeUndefined();
      }
    });

    it("rejects non-UUID sessionIds", () => {
      const result = forAnimaConfigSchema.safeParse({
        ...base,
        sessionId: "../escape",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid chunk geometry", () => {
      for (const bad of [
        { ...chunkFields, expectedImageCount: 0 },
        { ...chunkFields, expectedImageCount: 1.5 },
        { ...chunkFields, chunkIndex: -1 },
        { ...chunkFields, chunkSize: 0 },
        { ...chunkFields, chunkSize: 10_000 },
      ]) {
        const result = forAnimaConfigSchema.safeParse({ ...base, ...bad });
        expect(result.success).toBe(false);
      }
    });
  });
});
