import type { Citizen } from "./citizens";
import { byNationalId, byRef, childrenOf } from "./store";

/** A name compared without accents, case or spaces around it: "Ingabire " matches "ingabire". */
function folded(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export type PersonOut = {
  ref: string;
  fullName: string;
  firstName: string;
  dateOfBirth: string;
  sex: Citizen["sex"];
  district: string;
};

/** A person as the identity service returns them. */
function personOut(citizen: Citizen): PersonOut {
  return {
    ref: citizen.ref,
    fullName: citizen.names.join(" "),
    firstName: citizen.names[0],
    dateOfBirth: citizen.dateOfBirth,
    sex: citizen.sex,
    district: citizen.district,
  };
}

/**
 * Checks a login: the ID must exist, and the date of birth and one of the person's names must match.
 * A mismatch gets the same answer as an unknown ID, so the answer never reveals which part was wrong.
 */
export async function verify(nationalId: string, dateOfBirth: string, name: string) {
  const citizen = await byNationalId(nationalId);
  if (!citizen) return { match: false as const };

  const theirNames = citizen.names.map(folded);
  const oneNameMatches = name.split(/\s+/).some((typed) => theirNames.includes(folded(typed)));
  if (citizen.dateOfBirth !== dateOfBirth || !oneNameMatches) return { match: false as const };

  const children = (await childrenOf(citizen.ref)).map(personOut);
  return { match: true as const, person: personOut(citizen), children };
}

export function findByRef(ref: string) {
  return byRef(ref);
}
