import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModeToggle } from "./ModeToggle";

// ---------------------------------------------------------------------------
// ModeToggle
// ---------------------------------------------------------------------------

describe("ModeToggle", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders SFW and NSFW labels", () => {
    render(<ModeToggle mode="sfw" onModeChange={() => {}} />);
    expect(screen.getByText("SFW")).toBeDefined();
    expect(screen.getByText("NSFW")).toBeDefined();
  });

  it("renders Content Mode label", () => {
    render(<ModeToggle mode="sfw" onModeChange={() => {}} />);
    expect(screen.getByText("Content Mode")).toBeDefined();
  });

  it("shows SFW description when in SFW mode", () => {
    render(<ModeToggle mode="sfw" onModeChange={() => {}} />);
    expect(screen.getByText(/Safe-for-work prompts/)).toBeDefined();
  });

  it("shows NSFW description when in NSFW mode", () => {
    render(<ModeToggle mode="nsfw" onModeChange={() => {}} />);
    expect(screen.getByText(/Unfiltered prompts/)).toBeDefined();
  });

  it("calls onModeChange when clicked", () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="sfw" onModeChange={onChange} />);
    const toggle = document.querySelector<HTMLElement>('[role="switch"]');
    toggle?.click();
    expect(onChange).toHaveBeenCalledWith("nsfw");
  });

  it("does not call onModeChange when disabled", () => {
    const onChange = vi.fn();
    render(
      <ModeToggle mode="sfw" onModeChange={onChange} disabled />
    );
    const toggle = document.querySelector<HTMLElement>('[role="switch"]');
    toggle?.click();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("toggles from nsfw to sfw", () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="nsfw" onModeChange={onChange} />);
    const toggle = document.querySelector<HTMLElement>('[role="switch"]');
    toggle?.click();
    expect(onChange).toHaveBeenCalledWith("sfw");
  });

  it("has role=switch for accessibility", () => {
    render(<ModeToggle mode="sfw" onModeChange={() => {}} />);
    const toggle = document.querySelector('[role="switch"]');
    expect(toggle).toBeDefined();
  });

  it("has aria-checked=false when in SFW mode", () => {
    render(<ModeToggle mode="sfw" onModeChange={() => {}} />);
    const toggle = document.querySelector('[role="switch"]');
    expect(toggle?.getAttribute("aria-checked")).toBe("false");
  });

  it("has aria-checked=true when in NSFW mode", () => {
    render(<ModeToggle mode="nsfw" onModeChange={() => {}} />);
    const toggle = document.querySelector('[role="switch"]');
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
  });

  it("toggles on Enter key press", () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="sfw" onModeChange={onChange} />);
    const toggle = document.querySelector('[role="switch"]');
    fireEvent.keyDown(toggle!, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("nsfw");
  });

  it("toggles on Space key press", () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="sfw" onModeChange={onChange} />);
    const toggle = document.querySelector('[role="switch"]');
    fireEvent.keyDown(toggle!, { key: " " });
    expect(onChange).toHaveBeenCalledWith("nsfw");
  });
});
