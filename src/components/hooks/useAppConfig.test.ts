import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAppConfig } from "./useAppConfig";

// ---------------------------------------------------------------------------
// useAppConfig — store integration and defaults
// ---------------------------------------------------------------------------

describe("useAppConfig", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns all expected properties", () => {
    const { result } = renderHook(() => useAppConfig());

    const expectedKeys = [
      "serverUrl",
      "setServerUrl",
      "selectedModel",
      "setSelectedModel",
      "contentMode",
      "setContentMode",
      "presetId",
      "setPresetId",
      "presetLabel",
      "presetZipName",
      "presetNeedsTrigger",
      "systemPrompt",
      "setSystemPrompt",
      "userPrompt",
      "setUserPrompt",
      "triggerWord",
      "setTriggerWord",
      "triggerRequired",
      "parallelRequests",
      "setParallelRequests",
      "toast",
      "showToast",
      "hideToast",
    ];

    for (const key of expectedKeys) {
      expect(result.current).toHaveProperty(key);
    }
  });

  it("has default server URL", () => {
    const { result } = renderHook(() => useAppConfig());
    expect(result.current.serverUrl).toBeDefined();
    expect(result.current.serverUrl.length).toBeGreaterThan(0);
  });

  it("allows setting server URL", () => {
    const { result } = renderHook(() => useAppConfig());

    act(() => {
      result.current.setServerUrl("http://example.com");
    });

    expect(result.current.serverUrl).toBe("http://example.com");
  });

  it("allows setting model", () => {
    const { result } = renderHook(() => useAppConfig());

    act(() => {
      result.current.setSelectedModel("gpt-4-vision");
    });

    expect(result.current.selectedModel).toBe("gpt-4-vision");
  });

  it("allows setting preset", () => {
    const { result } = renderHook(() => useAppConfig());

    act(() => {
      result.current.setPresetId("flux1-dev");
    });

    expect(result.current.presetId).toBe("flux1-dev");
  });

  it("returns preset label matching preset", () => {
    const { result } = renderHook(() => useAppConfig());

    act(() => {
      result.current.setPresetId("flux1-dev");
    });

    expect(result.current.presetLabel).toBeDefined();
    expect(result.current.presetLabel.length).toBeGreaterThan(0);
  });

  it("allows setting prompts", () => {
    const { result } = renderHook(() => useAppConfig());

    act(() => {
      result.current.setSystemPrompt("Custom system prompt");
      result.current.setUserPrompt("Custom user prompt");
    });

    expect(result.current.systemPrompt).toBe("Custom system prompt");
    expect(result.current.userPrompt).toBe("Custom user prompt");
  });

  it("allows setting trigger word", () => {
    const { result } = renderHook(() => useAppConfig());

    act(() => {
      result.current.setTriggerWord("PERSON");
    });

    expect(result.current.triggerWord).toBe("PERSON");
  });

  it("allows setting parallel requests", () => {
    const { result } = renderHook(() => useAppConfig());

    act(() => {
      result.current.setParallelRequests(6);
    });

    expect(result.current.parallelRequests).toBe(6);
  });

  it("toast starts hidden", () => {
    const { result } = renderHook(() => useAppConfig());
    expect(result.current.toast.visible).toBe(false);
    expect(result.current.toast.message).toBe("");
  });

  it("showToast makes toast visible", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAppConfig());

    act(() => {
      result.current.showToast("Test message");
    });

    expect(result.current.toast.visible).toBe(true);
    expect(result.current.toast.message).toBe("Test message");
    vi.useRealTimers();
  });

  it("hideToast hides the toast", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAppConfig());

    act(() => {
      result.current.showToast("Test message");
    });

    expect(result.current.toast.visible).toBe(true);

    act(() => {
      result.current.hideToast();
    });

    expect(result.current.toast.visible).toBe(false);
    vi.useRealTimers();
  });

  it("auto-hides toast after TOAST_DURATION", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAppConfig());

    act(() => {
      result.current.showToast("Auto hide test");
    });

    expect(result.current.toast.visible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(result.current.toast.visible).toBe(false);
    vi.useRealTimers();
  });
});
