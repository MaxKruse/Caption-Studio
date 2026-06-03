import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SessionRestoredBanner } from "./SessionRestoredBanner";

// ---------------------------------------------------------------------------
// SessionRestoredBanner — visibility and timing
// ---------------------------------------------------------------------------

describe("SessionRestoredBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("does not render when restored is false", () => {
    render(<SessionRestoredBanner restored={false} />);
    expect(screen.queryByText(/Welcome back/)).toBeNull();
  });

  it("becomes visible after 300ms delay when restored is true", () => {
    render(<SessionRestoredBanner restored />);
    expect(screen.queryByText(/Welcome back/)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText("Welcome back — your settings are restored")).toBeDefined();
  });

  it("starts fading after 3300ms", () => {
    render(<SessionRestoredBanner restored />);

    act(() => {
      vi.advanceTimersByTime(3300);
    });

    const banner = screen.getByText("Welcome back — your settings are restored").closest("div[role='status']");
    expect(banner?.className).toContain("animate-fade-out");
  });

  it("fully disappears after 3700ms", () => {
    render(<SessionRestoredBanner restored />);

    act(() => {
      vi.advanceTimersByTime(3700);
    });

    expect(screen.queryByText(/Welcome back/)).toBeNull();
  });

  it("has role=status for accessibility", () => {
    render(<SessionRestoredBanner restored />);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    const status = document.querySelector('[role="status"]');
    expect(status).toBeDefined();
  });
});
