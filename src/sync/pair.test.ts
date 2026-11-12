import { describe, expect, it } from "vitest";
import { makePairCode, readPairCode } from "./pair";

describe("pairing code", () => {
  it("round-trips repository and token", () => {
    const code = makePairCode("heresiarchus/fitnes-data", "github_pat_ABC_123");
    expect(code.startsWith("FITNES1.")).toBe(true);
    expect(code).not.toMatch(/[+/=]/);
    expect(readPairCode("  " + code + " ")).toEqual({ repo: "heresiarchus/fitnes-data", token: "github_pat_ABC_123" });
  });
  it("rejects anything else", () => {
    expect(readPairCode("github_pat_ABC")).toBeNull();
    expect(readPairCode("FITNES1.???")).toBeNull();
  });
});
