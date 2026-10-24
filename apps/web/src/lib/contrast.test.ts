import { describe, expect, it } from "vitest";
import { contrast } from "./contrast";
import { palette, pairs } from "./tokens";

describe("contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });

  it.each(pairs)("%s passes (%s on %s, needs %d:1)", (_, fg, bg, min) => {
    expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(min);
  });
});
