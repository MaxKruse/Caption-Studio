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
});
