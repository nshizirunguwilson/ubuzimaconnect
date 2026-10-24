import { describe, expect, it } from "vitest";
import { verify } from "./verify";

describe("verify", () => {
  it("matches with the date of birth and any one name, ignoring case and accents", () => {
    const r = verify("1199270045823116", "1992-03-14", "UWASÉ");
    expect(r.match).toBe(true);
    if (r.match) expect(r.children.map((c) => c.firstName)).toEqual(["Kevin", "Grace"]);
  });

  it("gives the same answer for a wrong date of birth, a wrong name and an unknown ID", () => {
    expect(verify("1199270045823116", "1992-03-15", "Aline")).toEqual({ match: false });
    expect(verify("1199270045823116", "1992-03-14", "Marie")).toEqual({ match: false });
    expect(verify("1000000000000000", "1992-03-14", "Aline")).toEqual({ match: false });
  });
});
