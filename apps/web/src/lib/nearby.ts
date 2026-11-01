/**
 * The 5 nearest facilities are kept on the device so they can be shown without internet.
 * Not kept on a device that isn't the patient's. Facility details only; nothing about the patient.
 */
export type NearbyFacility = { name: string; distance: string; services: string[]; phone: string | null };
export const NEARBY_KEY = "uc_nearby";

export function saveNearby(list: NearbyFacility[], sharedDevice: boolean) {
  if (sharedDevice) return;
  try {
    localStorage.setItem(NEARBY_KEY, JSON.stringify({ savedAt: new Date().toISOString(), list }));
  } catch {
    // Storage can be full or blocked; the online screens don't depend on it.
  }
}

export function readNearby(): { savedAt: string; list: NearbyFacility[] } | null {
  try {
    const raw = localStorage.getItem(NEARBY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
