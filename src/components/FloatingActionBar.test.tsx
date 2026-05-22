import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FloatingActionBar } from "./FloatingActionBar";

// ---------------------------------------------------------------------------
// Ready state — caption button + quick actions
// ---------------------------------------------------------------------------

describe("FloatingActionBar ready state", () => {
  it("does not render when no images and no job", () => {
    render(
      <FloatingActionBar
        imagesCount={0}
        canCaption={false}
        isProcessing={false}
        jobId={null}
        progress={{ total: 0, completed: 0, failed: 0, processing: 0, queued: 0 }}
        progressPercent={0}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={false}
      />
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows caption button when images uploaded but no job", () => {
    render(
      <FloatingActionBar
        imagesCount={5}
        canCaption={true}
        isProcessing={false}
        jobId={null}
        progress={{ total: 0, completed: 0, failed: 0, processing: 0, queued: 0 }}
        progressPercent={0}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={false}
      />
    );
    expect(screen.getByRole("button", { name: "Caption 5 Images" })).toBeDefined();
  });

  it("shows singular image count", () => {
    render(
      <FloatingActionBar
        imagesCount={1}
        canCaption={true}
        isProcessing={false}
        jobId={null}
        progress={{ total: 0, completed: 0, failed: 0, processing: 0, queued: 0 }}
        progressPercent={0}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={false}
      />
    );
    expect(screen.getByRole("button", { name: "Caption 1 Image" })).toBeDefined();
  });

  it("disables caption button when canCaption is false", () => {
    render(
      <FloatingActionBar
        imagesCount={3}
        canCaption={false}
        isProcessing={false}
        jobId={null}
        progress={{ total: 0, completed: 0, failed: 0, processing: 0, queued: 0 }}
        progressPercent={0}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={false}
      />
    );
    expect(screen.getByRole("button", { name: "Caption 3 Images" })).toBeDisabled();
  });

  it("shows Add more button in ready state", () => {
    render(
      <FloatingActionBar
        imagesCount={3}
        canCaption={true}
        isProcessing={false}
        jobId={null}
        progress={{ total: 0, completed: 0, failed: 0, processing: 0, queued: 0 }}
        progressPercent={0}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={false}
      />
    );
    expect(screen.getByRole("button", { name: "Add more images" })).toBeDefined();
  });

  it("shows Clear all button in ready state", () => {
    render(
      <FloatingActionBar
        imagesCount={3}
        canCaption={true}
        isProcessing={false}
        jobId={null}
        progress={{ total: 0, completed: 0, failed: 0, processing: 0, queued: 0 }}
        progressPercent={0}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={false}
      />
    );
    expect(screen.getByRole("button", { name: "Clear all" })).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Processing state — progress bar + time estimate + abort
// ---------------------------------------------------------------------------

describe("FloatingActionBar processing state", () => {
  it("shows progress bar and abort button during processing", () => {
    render(
      <FloatingActionBar
        imagesCount={10}
        canCaption={false}
        isProcessing={true}
        jobId="test-job-123"
        progress={{ total: 10, completed: 3, failed: 1, processing: 2, queued: 4 }}
        progressPercent={40}
        estimatedRemainingMs={30000}
        avgTimeMs={5000}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={false}
      />
    );
    expect(screen.getByText("3 done")).toBeDefined();
    expect(screen.getByText(/1 failed/)).toBeDefined();
    expect(screen.getByText("40%")).toBeDefined();
    expect(screen.getByRole("button", { name: "Abort" })).toBeDefined();
  });

  it("shows time estimate with remaining, per-image, and images left", () => {
    render(
      <FloatingActionBar
        imagesCount={10}
        canCaption={false}
        isProcessing={true}
        jobId="test-job-123"
        progress={{ total: 10, completed: 3, failed: 0, processing: 2, queued: 5 }}
        progressPercent={30}
        estimatedRemainingMs={60000}
        avgTimeMs={12000}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={false}
      />
    );
    expect(screen.getByText("1m remaining")).toBeDefined();
    expect(screen.getByText("~12s per image")).toBeDefined();
    expect(screen.getByText("7 images left")).toBeDefined();
  });

  it("shows 'Waiting...' when estimatedRemainingMs is undefined", () => {
    render(
      <FloatingActionBar
        imagesCount={10}
        canCaption={false}
        isProcessing={true}
        jobId="test-job-123"
        progress={{ total: 10, completed: 0, failed: 0, processing: 0, queued: 10 }}
        progressPercent={0}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={false}
      />
    );
    expect(screen.getByText("Waiting...")).toBeDefined();
  });

  it("shows singular 'image left' when one remains", () => {
    render(
      <FloatingActionBar
        imagesCount={10}
        canCaption={false}
        isProcessing={true}
        jobId="test-job-123"
        progress={{ total: 10, completed: 9, failed: 0, processing: 0, queued: 1 }}
        progressPercent={90}
        estimatedRemainingMs={5000}
        avgTimeMs={5000}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={false}
      />
    );
    expect(screen.getByText("1 image left")).toBeDefined();
  });

  it("omits failed count when no failures", () => {
    render(
      <FloatingActionBar
        imagesCount={10}
        canCaption={false}
        isProcessing={true}
        jobId="test-job-123"
        progress={{ total: 10, completed: 5, failed: 0, processing: 2, queued: 3 }}
        progressPercent={50}
        estimatedRemainingMs={30000}
        avgTimeMs={5000}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={false}
      />
    );
    expect(screen.queryByText(/failed/)).toBeNull();
  });

  it("hides abort button when not actively processing", () => {
    render(
      <FloatingActionBar
        imagesCount={10}
        canCaption={false}
        isProcessing={false}
        jobId="test-job-123"
        progress={{ total: 10, completed: 10, failed: 0, processing: 0, queued: 0 }}
        progressPercent={100}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={true}
      />
    );
    expect(screen.queryByRole("button", { name: "Abort" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Done state — download + start over
// ---------------------------------------------------------------------------

describe("FloatingActionBar done state", () => {
  it("shows download and start over buttons when job done", () => {
    render(
      <FloatingActionBar
        imagesCount={10}
        canCaption={true}
        isProcessing={false}
        jobId="test-job-123"
        progress={{ total: 10, completed: 8, failed: 2, processing: 0, queued: 0 }}
        progressPercent={100}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={true}
      />
    );
    expect(screen.getByRole("button", { name: "Download ZIP" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Start over" })).toBeDefined();
  });

  it("shows completion summary with failures", () => {
    render(
      <FloatingActionBar
        imagesCount={10}
        canCaption={true}
        isProcessing={false}
        jobId="test-job-123"
        progress={{ total: 10, completed: 7, failed: 3, processing: 0, queued: 0 }}
        progressPercent={100}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={true}
      />
    );
    expect(screen.getByText("7 completed")).toBeDefined();
    expect(screen.getByText(/3 failed/)).toBeDefined();
  });

  it("shows completion summary without failures", () => {
    render(
      <FloatingActionBar
        imagesCount={5}
        canCaption={true}
        isProcessing={false}
        jobId="test-job-123"
        progress={{ total: 5, completed: 5, failed: 0, processing: 0, queued: 0 }}
        progressPercent={100}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={true}
      />
    );
    expect(screen.getByText("5 completed")).toBeDefined();
    expect(screen.queryByText(/failed/)).toBeNull();
  });

  it("does not show caption button when job done", () => {
    render(
      <FloatingActionBar
        imagesCount={5}
        canCaption={true}
        isProcessing={false}
        jobId="test-job-123"
        progress={{ total: 5, completed: 5, failed: 0, processing: 0, queued: 0 }}
        progressPercent={100}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={true}
      />
    );
    expect(screen.queryByRole("button", { name: /^Caption/ })).toBeNull();
  });

  it("does not show Add more button when job done", () => {
    render(
      <FloatingActionBar
        imagesCount={5}
        canCaption={true}
        isProcessing={false}
        jobId="test-job-123"
        progress={{ total: 5, completed: 5, failed: 0, processing: 0, queued: 0 }}
        progressPercent={100}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={true}
      />
    );
    expect(screen.queryByRole("button", { name: "Add more images" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

describe("FloatingActionBar state transitions", () => {
  it("shows processing state when jobId exists and isProcessing", () => {
    render(
      <FloatingActionBar
        imagesCount={5}
        canCaption={false}
        isProcessing={true}
        jobId="test-job-123"
        progress={{ total: 5, completed: 1, failed: 0, processing: 1, queued: 3 }}
        progressPercent={20}
        estimatedRemainingMs={20000}
        avgTimeMs={5000}
        onStartCaptioning={() => {}}
        onAbort={() => {}}
        onAddMore={() => {}}
        onClearAll={() => {}}
        onDownloadZip={() => {}}
        jobDone={false}
      />
    );
    // Should show processing UI, not ready or done UI
    expect(screen.queryByRole("button", { name: /^Caption/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Download ZIP" })).toBeNull();
    expect(screen.getByRole("button", { name: "Abort" })).toBeDefined();
  });
});
