import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyStateHero } from "./EmptyStateHero";

// ---------------------------------------------------------------------------
// EmptyStateHero — rendering and interaction
// ---------------------------------------------------------------------------

describe("EmptyStateHero", () => {
  const defaultProps = {
    onClick: () => {},
    dragOver: false,
    isProcessing: false,
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
  };

  it("renders the upload headline", () => {
    render(<EmptyStateHero {...defaultProps} />);
    expect(screen.getByText("Upload your images")).toBeDefined();
  });

  it("renders the drag & drop instruction", () => {
    render(<EmptyStateHero {...defaultProps} />);
    expect(screen.getByText(/Click to upload or drag & drop/)).toBeDefined();
  });

  it("renders supported formats", () => {
    render(<EmptyStateHero {...defaultProps} />);
    expect(screen.getByText("PNG, JPG, JPEG, WebP, GIF")).toBeDefined();
  });

  it("renders tip badges", () => {
    render(<EmptyStateHero {...defaultProps} />);
    expect(screen.getByText(/15–30 images recommended/i)).toBeDefined();
    expect(screen.getByText(/Mix portraits & full-body/i)).toBeDefined();
    expect(screen.getByText(/Full resolution preserved/i)).toBeDefined();
  });

  it("calls onClick when the drop zone is clicked", () => {
    const onClick = vi.fn();
    render(<EmptyStateHero {...defaultProps} onClick={onClick} />);
    // Click on the headline text which is inside the clickable container
    const headline = screen.getByText("Upload your images");
    headline.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClick).toHaveBeenCalled();
  });

  it("applies dragOver styles when dragOver is true", () => {
    const { container } = render(
      <EmptyStateHero {...defaultProps} dragOver />
    );
    const dropZone = container.querySelector("div.border-dashed");
    expect(dropZone?.className).toContain("bg-zinc-100");
  });

  it("disables pointer events when isProcessing is true", () => {
    const { container } = render(
      <EmptyStateHero {...defaultProps} isProcessing />
    );
    const dropZone = container.querySelector("div.border-dashed");
    expect(dropZone?.className).toContain("pointer-events-none");
  });
});
