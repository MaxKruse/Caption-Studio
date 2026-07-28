/**
 * Tests for URL utilities (url-utils.ts).
 * Tests normalizeServerUrl() and toDockerHostUrl().
 */

import { describe, it, expect, afterEach } from "bun:test";
import { normalizeServerUrl, toDockerHostUrl } from "@/lib/url-utils";

// ---------------------------------------------------------------------------
// normalizeServerUrl tests
// ---------------------------------------------------------------------------

describe("normalizeServerUrl", () => {
  it("strips trailing slash", () => {
    expect(normalizeServerUrl("http://localhost:8080/")).toBe("http://localhost:8080");
  });

  it("strips multiple trailing slashes", () => {
    expect(normalizeServerUrl("http://localhost:8080///")).toBe("http://localhost:8080");
  });

  it("strips /v1 suffix", () => {
    expect(normalizeServerUrl("http://localhost:8080/v1")).toBe("http://localhost:8080");
  });

  it("strips /v1 and trailing slash", () => {
    expect(normalizeServerUrl("http://localhost:8080/v1/")).toBe("http://localhost:8080");
  });

  it("strips /v1 with multiple trailing slashes", () => {
    expect(normalizeServerUrl("http://localhost:8080/v1///")).toBe("http://localhost:8080");
  });

  it("leaves URL unchanged when already clean", () => {
    expect(normalizeServerUrl("http://localhost:8080")).toBe("http://localhost:8080");
  });

  it("preserves path segments that are not /v1", () => {
    expect(normalizeServerUrl("http://localhost:8080/api")).toBe("http://localhost:8080/api");
  });

  it("preserves port number", () => {
    expect(normalizeServerUrl("http://localhost:12345/v1")).toBe("http://localhost:12345");
  });

  it("preserves https scheme", () => {
    expect(normalizeServerUrl("https://example.com/v1/")).toBe("https://example.com");
  });

  it("handles IP address", () => {
    expect(normalizeServerUrl("http://192.168.1.1:8080/v1")).toBe("http://192.168.1.1:8080");
  });
});

// ---------------------------------------------------------------------------
// toDockerHostUrl tests
// ---------------------------------------------------------------------------

describe("toDockerHostUrl", () => {
  const originalEnv = process.env.DOCKER_HOST_INTERNAL;

  afterEach(() => {
    // Restore original env
    if (originalEnv === undefined) {
      delete process.env.DOCKER_HOST_INTERNAL;
    } else {
      process.env.DOCKER_HOST_INTERNAL = originalEnv;
    }
  });

  it("is a no-op when DOCKER_HOST_INTERNAL is not set", () => {
    delete process.env.DOCKER_HOST_INTERNAL;
    expect(toDockerHostUrl("http://localhost:8080")).toBe("http://localhost:8080");
  });

  it("replaces localhost with DOCKER_HOST_INTERNAL", () => {
    process.env.DOCKER_HOST_INTERNAL = "host.docker.internal";
    expect(toDockerHostUrl("http://localhost:8080")).toBe("http://host.docker.internal:8080");
  });

  it("replaces 127.0.0.1 with DOCKER_HOST_INTERNAL", () => {
    process.env.DOCKER_HOST_INTERNAL = "host.docker.internal";
    expect(toDockerHostUrl("http://127.0.0.1:8080")).toBe("http://host.docker.internal:8080");
  });

  it("preserves port number during replacement", () => {
    process.env.DOCKER_HOST_INTERNAL = "172.17.0.1";
    expect(toDockerHostUrl("http://localhost:12345")).toBe("http://172.17.0.1:12345");
  });

  it("does not replace non-localhost hosts", () => {
    process.env.DOCKER_HOST_INTERNAL = "host.docker.internal";
    expect(toDockerHostUrl("http://192.168.1.100:8080")).toBe("http://192.168.1.100:8080");
  });

  it("does not replace hostname that contains 'localhost' as substring", () => {
    process.env.DOCKER_HOST_INTERNAL = "host.docker.internal";
    expect(toDockerHostUrl("http://mylocalhost-server:8080")).toBe("http://mylocalhost-server:8080");
  });

  it("handles URL without explicit port (trailing colon is current behavior)", () => {
    process.env.DOCKER_HOST_INTERNAL = "host.docker.internal";
    // Current implementation produces trailing colon when no port
    expect(toDockerHostUrl("http://localhost")).toBe("http://host.docker.internal:");
  });

  it("preserves https scheme", () => {
    process.env.DOCKER_HOST_INTERNAL = "host.docker.internal";
    expect(toDockerHostUrl("https://localhost:8080")).toBe("https://host.docker.internal:8080");
  });
});
