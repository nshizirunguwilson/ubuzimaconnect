import { describe, expect, it } from "vitest";
import { nidaPersonInput, photoType } from "./nida";

const base = { names: "Uwase Aline", sex: "FEMALE", dateOfBirth: "1990-05-01", district: "Gasabo" };

describe("adding a person to the mock NIDA (D73)", () => {
  it("accepts a valid adult and normalises names and phone", () => {
    const r = nidaPersonInput.parse({ ...base, names: "  Mukamana   Uwase ", phone: "0788 123 456" });
    expect(r.names).toEqual(["Mukamana", "Uwase"]);
    expect(r.phone).toBe("0788123456");
  });
  it("refuses SQL and markup in names: letters only", () => {
    for (const names of ["Robert'); DROP TABLE nida.person;--", "Aline <script>", "Aline 1"]) {
      expect(nidaPersonInput.safeParse({ ...base, names }).success).toBe(false);
    }
    expect(nidaPersonInput.safeParse({ ...base, names: "N'Dayisaba Mukamana-Uwase" }).success).toBe(true);
  });
  it("refuses one name, five names, dates that don't exist, future dates and over 120 years", () => {
    expect(nidaPersonInput.safeParse({ ...base, names: "Aline" }).success).toBe(false);
    expect(nidaPersonInput.safeParse({ ...base, names: "A B C D E" }).success).toBe(false);
    expect(nidaPersonInput.safeParse({ ...base, dateOfBirth: "2001-02-30" }).success).toBe(false);
    expect(nidaPersonInput.safeParse({ ...base, dateOfBirth: "2999-01-01" }).success).toBe(false);
    expect(nidaPersonInput.safeParse({ ...base, dateOfBirth: "1890-01-01" }).success).toBe(false);
  });
  it("needs a real district, a Rwandan phone and a parent for a child under 16", () => {
    expect(nidaPersonInput.safeParse({ ...base, district: "Paris" }).success).toBe(false);
    expect(nidaPersonInput.safeParse({ ...base, phone: "12345" }).success).toBe(false);
    const child = { ...base, dateOfBirth: new Date(Date.now() - 5 * 365 * 86_400_000).toISOString().slice(0, 10) };
    expect(nidaPersonInput.safeParse(child).success).toBe(false);
    expect(nidaPersonInput.safeParse({ ...child, parentRef: "NIDA-0001" }).success).toBe(true);
    expect(nidaPersonInput.safeParse({ ...child, parentRef: "NIDA-0001' OR 1=1" }).success).toBe(false);
  });
  it("only takes JPEG or PNG photos, checked by their first bytes", () => {
    expect(photoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(photoType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(photoType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(nidaPersonInput.safeParse({ ...base, photo: "data:image/svg+xml;base64,PHN2Zz4=" }).success).toBe(false);
  });
});
