import { describe, expect, it } from "vitest";
import { formatNationalId, greetingName, nationalId, newPassword, patientLogin } from "./schemas";

describe("shared rules", () => {
  it("accepts a national ID typed with spaces and stores it without them", () => {
    expect(nationalId.parse("1 1987 8 0592371 0 64")).toBe("1198780592371064");
    expect(nationalId.safeParse("1 1987 8").success).toBe(false);
  });

  it("shows a national ID in the card's six parts, even half typed", () => {
    expect(formatNationalId("1198780592371064")).toBe("1 1987 8 0592371 0 64");
    expect(formatNationalId("119878")).toBe("1 1987 8");
    expect(formatNationalId("1 1987 8 0592371 0 64 99")).toBe("1 1987 8 0592371 0 64");
  });

  it("refuses 16 digits that can't be a Rwandan ID (sex digit must be 7 or 8)", () => {
    expect(nationalId.safeParse("1198750592371064").success).toBe(false);
    expect(nationalId.safeParse("9198780592371064").success).toBe(false);
  });

  it("treats the shared-phone choice as off unless chosen (FR 1.8)", () => {
    const r = patientLogin.parse({ nationalId: "1199270045823116", dateOfBirth: "1992-03-14", name: "Aline" });
    expect(r.sharedDevice).toBe(false);
  });

  it("asks for at least 8 characters in a password (NIST SP 800-63B-4, with a second factor)", () => {
    expect(newPassword.safeParse("seven c").success).toBe(false);
    expect(newPassword.safeParse("@Wilson.01").success).toBe(true);
  });

  it("greets people by first name, without titles", () => {
    expect(greetingName("Dr. Samuel Mugisha")).toBe("Samuel");
    expect(greetingName("Aline Uwase")).toBe("Aline");
  });
});
