import { citizens, type Citizen } from "./citizens";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export type PersonOut = {
  ref: string;
  fullName: string;
  firstName: string;
  dateOfBirth: string;
  sex: Citizen["sex"];
  district: string;
};

function out(c: Citizen): PersonOut {
  return {
    ref: c.ref,
    fullName: c.names.join(" "),
    firstName: c.names[0],
    dateOfBirth: c.dateOfBirth,
    sex: c.sex,
    district: c.district,
  };
}

/**
 * FR 1.1 and 1.2: the ID must exist, and the date of birth and one of the person's names must match.
 * A mismatch returns the same answer as an unknown ID, so the response never reveals which part was wrong.
 */
export function verify(nationalId: string, dateOfBirth: string, name: string) {
  const c = citizens.find((x) => x.nationalId === nationalId);
  const ok =
    !!c && c.dateOfBirth === dateOfBirth && name.split(/\s+/).some((n) => c.names.map(fold).includes(fold(n)));
  if (!c || !ok) return { match: false as const };
  const children = citizens.filter((x) => x.parentRefs.includes(c.ref)).map(out);
  return { match: true as const, person: out(c), children };
}

export function findByRef(ref: string) {
  return citizens.find((c) => c.ref === ref);
}
