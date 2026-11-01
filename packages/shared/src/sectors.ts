import sectors from "./data/sectors.json";

/** Rwanda's 416 sectors with their centre points (source: NISR via HDX, see data/README.md). */
export type Sector = { code: string; name: string; district: string; province: string; lat: number; lng: number };

export const SECTORS = sectors as Sector[];

export function sectorsOf(district: string) {
  return SECTORS.filter((sector) => sector.district === district);
}

export function sectorByCode(code: string) {
  return SECTORS.find((sector) => sector.code === code);
}
