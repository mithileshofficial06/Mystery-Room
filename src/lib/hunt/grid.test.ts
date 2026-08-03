import { describe, expect, it } from "vitest";
import { buildGrid, GRID_COLOURS, isAnagram, lettersFor } from "./grid";

const WORDS = [
  "spiderly", "webbings", "villains", "symbiote",
  "multiver", "gwenpool", "octopusx", "daybugle",
];

describe("buildGrid", () => {
  it("produces exactly 64 cells", () => {
    expect(buildGrid(WORDS, 1).length).toBe(64);
  });

  it("gives every colour exactly 8 cells", () => {
    const grid = buildGrid(WORDS, 1);
    for (let c = 0; c < GRID_COLOURS.length; c += 1) {
      expect(grid.filter((cell) => cell.colour === c).length).toBe(8);
    }
  });

  it("scatters each word rather than leaving it in a run", () => {
    const grid = buildGrid(WORDS, 1);
    const positions = grid
      .map((cell, i) => ({ ...cell, i }))
      .filter((cell) => cell.colour === 0)
      .map((cell) => cell.i);
    const contiguous = positions.every((p, k) => k === 0 || p === positions[k - 1] + 1);
    expect(contiguous).toBe(false);
  });

  it("is deterministic for a given seed", () => {
    expect(buildGrid(WORDS, 42)).toEqual(buildGrid(WORDS, 42));
  });

  it("differs between seeds", () => {
    expect(buildGrid(WORDS, 1)).not.toEqual(buildGrid(WORDS, 2));
  });

  it("rejects a word list that is not 8 words of 8 letters", () => {
    expect(() => buildGrid(["short"], 1)).toThrow();
    expect(() => buildGrid([...WORDS, "extraone"], 1)).toThrow();
  });
});

describe("lettersFor", () => {
  it("returns that colour's 8 letters and they anagram to the word", () => {
    const grid = buildGrid(WORDS, 7);
    const letters = lettersFor(grid, 3);
    expect(letters.length).toBe(8);
    expect(isAnagram(letters.join(""), WORDS[3])).toBe(true);
  });
});

describe("isAnagram", () => {
  it("ignores order and case", () => {
    expect(isAnagram("SPIDER", "redips")).toBe(true);
  });

  it("rejects different letter multisets", () => {
    expect(isAnagram("spider", "spidee")).toBe(false);
  });

  it("rejects different lengths", () => {
    expect(isAnagram("spider", "spiders")).toBe(false);
  });
});
