import sectors from "./data/sectors.json";

/** FR 3.4: Rwanda's 416 sectors with their centre points (source: NISR via HDX, see data/README.md). */
export type Sector = { code: string; name: string; district: string; province: string; lat: number; lng: number };
export const SECTORS = sectors as Sector[];
export const sectorsOf = (district: string) => SECTORS.filter((s) => s.district === district);
export const sectorByCode = (code: string) => SECTORS.find((s) => s.code === code);
