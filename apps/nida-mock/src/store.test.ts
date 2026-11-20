import { describe, expect, it } from "vitest";
import { citizens } from "./citizens";
import { byRef } from "./store";

describe("built-in portraits", () => {
  it("gives every built-in person a JPEG photo", async () => {
    for (const citizen of citizens) {
      const person = await byRef(citizen.ref);
      expect(person?.photoType).toBe("image/jpeg");
      // A JPEG starts with FF D8.
      expect(person?.photo?.subarray(0, 2).toString("hex")).toBe("ffd8");
    }
  });
});
