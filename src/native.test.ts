import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/app", () => ({ App: {} }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: {} }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false }, registerPlugin: () => ({}) }));

describe("isNewer", () => {
  it("compares versions by number, not by text", async () => {
    const { isNewer } = await import("./native");
    expect(isNewer("0.2.10", "0.2.9")).toBe(true);
    expect(isNewer("0.2.9", "0.2.10")).toBe(false);
    expect(isNewer("0.3", "0.2.99")).toBe(true);
    expect(isNewer("0.2.7", "0.2.7")).toBe(false);
  });
});
