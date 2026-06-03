import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mock localStorage for Zustand persist middleware
// ---------------------------------------------------------------------------

const mockStorage: Record<string, string> = {};

Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, value: string) => { mockStorage[key] = value; },
    removeItem: (key: string) => { delete mockStorage[key]; },
    clear: () => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); },
  },
  writable: true,
  configurable: true,
});
