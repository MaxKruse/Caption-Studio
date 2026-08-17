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

});
