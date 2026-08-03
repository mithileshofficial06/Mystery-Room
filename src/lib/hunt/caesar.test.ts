import { describe, expect, it } from "vitest";
import { shift } from "./caesar";

describe("shift", () => {
  it("shifts letters forward and wraps past z", () => {
    expect(shift("abc xyz", 3)).toBe("def abc");
  });

  it("preserves case", () => {
    expect(shift("AbZ", 1)).toBe("BcA");
  });

  it("leaves non-letters untouched", () => {
    expect(shift("a-b 1!", 1)).toBe("b-c 1!");
  });

  it("round-trips: shifting by n then by 26-n returns the original", () => {
    const text = "the daily bugle";
    expect(shift(shift(text, 7), 19)).toBe(text);
  });

  it("treats a shift of 0 and 26 as identity", () => {
    expect(shift("spider", 0)).toBe("spider");
    expect(shift("spider", 26)).toBe("spider");
  });

  it("accepts negative shifts", () => {
    expect(shift("def", -3)).toBe("abc");
  });
});
