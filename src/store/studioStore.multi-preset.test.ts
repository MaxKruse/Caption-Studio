import { describe, it, expect, beforeEach } from "vitest";
import { useStudioStore } from "./studioStore";

// ---------------------------------------------------------------------------
// studioStore — captionAllPresets config
// ---------------------------------------------------------------------------

describe("studioStore — captionAllPresets", () => {
  beforeEach(() => {
    useStudioStore.setState({
      config: {
        serverUrl: "http://localhost:8080",
        selectedModel: "",
        contentMode: "sfw",
        presetId: "flux1-dev",
        systemPrompt: "",
        userPrompt: "",
        triggerWord: "",
        parallelRequests: 4,
        captionAllPresets: false,
      },
      workflowStep: "configure",
      images: { names: [], count: 0 },
      job: {
        jobId: null,
        progress: { total: 0, queued: 0, processing: 0, completed: 0, failed: 0 },
        isProcessing: false,
        isDownloading: false,
        imageStatuses: {},
      },
      crop: {
        rulesetId: "crop_50_50",
        detections: [],
        crops: [],
        selectedImageIndex: 0,
      },
    });
  });

  it("defaults captionAllPresets to false", () => {
    const config = useStudioStore.getState().config;
    expect(config.captionAllPresets).toBe(false);
  });

  it("setCaptionAllPresets toggles the value", () => {
    useStudioStore.getState().setCaptionAllPresets(true);
    expect(useStudioStore.getState().config.captionAllPresets).toBe(true);

    useStudioStore.getState().setCaptionAllPresets(false);
    expect(useStudioStore.getState().config.captionAllPresets).toBe(false);
  });
});
