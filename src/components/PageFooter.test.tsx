import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageFooter } from "./PageFooter";

// ---------------------------------------------------------------------------
// PageFooter — rendering
// ---------------------------------------------------------------------------

describe("PageFooter", () => {
  it("renders the version number", () => {
    render(<PageFooter />);
    expect(screen.getByText(/Caption Studio v0\.1\.0/)).toBeDefined();
  });

  it("renders tech stack badges", () => {
    render(<PageFooter />);
    expect(screen.getByText("Next.js 16")).toBeDefined();
    expect(screen.getByText("React 19")).toBeDefined();
    expect(screen.getByText("TypeScript")).toBeDefined();
    expect(screen.getByText("Tailwind v4")).toBeDefined();
  });

  it("uses footer element", () => {
    render(<PageFooter />);
    expect(document.querySelector("footer")).toBeDefined();
  });
});
