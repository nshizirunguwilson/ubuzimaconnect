import { describe, expect, it } from "vitest";
import { withoutPorts } from "./forwarded";

describe("X-Forwarded-For behind Azure (D67)", () => {
  it("drops the port Azure's front end adds", () => {
    expect(withoutPorts("102.22.168.228:54321")).toBe("102.22.168.228");
    expect(withoutPorts("41.186.1.2, 20.244.77.107:1234")).toBe("41.186.1.2, 20.244.77.107");
    expect(withoutPorts("[2001:db8::1]:443")).toBe("2001:db8::1");
  });
  it("leaves plain addresses alone, IPv6 included", () => {
    expect(withoutPorts("102.22.168.228")).toBe("102.22.168.228");
    expect(withoutPorts("::1")).toBe("::1");
    expect(withoutPorts("2001:db8::1")).toBe("2001:db8::1");
  });
});
