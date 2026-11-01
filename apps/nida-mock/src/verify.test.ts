import { describe, expect, it } from "vitest";
import { verify } from "./verify";

describe("verify", () => {
  it("matches with the date of birth and any one name, ignoring case and accents", async () => {
    const result = await verify("1199270045823116", "1992-03-14", "UWASÉ");
    expect(result.match).toBe(true);
    if (result.match) expect(result.children.map((child) => child.firstName)).toEqual(["Kevin", "Grace"]);
  });

  it("gives the same answer for a wrong date of birth, a wrong name and an unknown ID", async () => {
    expect(await verify("1199270045823116", "1992-03-15", "Aline")).toEqual({ match: false });
    expect(await verify("1199270045823116", "1992-03-14", "Marie")).toEqual({ match: false });
    expect(await verify("1000000000000000", "1992-03-14", "Aline")).toEqual({ match: false });
  });
});
