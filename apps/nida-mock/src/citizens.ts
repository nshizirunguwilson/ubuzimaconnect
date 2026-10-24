/**
 * Fictional citizens for the mock identity service (NIDA). Nobody here is a real person.
 * National IDs follow the card's six parts: nationality (1 Rwandan) · year of birth · sex (7 female, 8 male) ·
 * birth-order number · times issued · two check digits, e.g. 1 1992 7 0045823 1 16. The check digits are invented.
 * Names follow Rwandan custom: each person has their own Kinyarwanda name, so children rarely share a
 * parent's surname, and the given names match the generation (Esperance in 1960, Aline in 1992, Keza in 2026).
 * Children under 16 have no ID of their own and are reached through a parent. A child of 16 or older
 * has their own ID and sees only their own records, while the parent still sees theirs (FR 1.3).
 */
export type Citizen = {
  ref: string;
  nationalId: string | null;
  names: string[];
  dateOfBirth: string;
  sex: "FEMALE" | "MALE";
  district: string;
  parentRefs: string[];
};

/** A date this many days before today, so the babies below always stay the age they demonstrate. */
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export const citizens: Citizen[] = [
  {
    ref: "NIDA-0001",
    nationalId: "1199270045823116",
    names: ["Aline", "Uwase"],
    dateOfBirth: "1992-03-14",
    sex: "FEMALE",
    district: "Gasabo",
    parentRefs: [],
  },
  {
    ref: "NIDA-0002",
    nationalId: null,
    names: ["Kevin", "Ishimwe"],
    dateOfBirth: "2019-06-02",
    sex: "MALE",
    district: "Gasabo",
    parentRefs: ["NIDA-0001"],
  },
  {
    ref: "NIDA-0003",
    nationalId: null,
    names: ["Grace", "Ineza"],
    dateOfBirth: "2022-11-20",
    sex: "FEMALE",
    district: "Gasabo",
    parentRefs: ["NIDA-0001"],
  },
  {
    ref: "NIDA-0004",
    nationalId: "1198580067412163",
    names: ["Jean", "Claude", "Habimana"],
    dateOfBirth: "1985-07-01",
    sex: "MALE",
    district: "Kicukiro",
    parentRefs: [],
  },
  {
    ref: "NIDA-0005",
    nationalId: null,
    names: ["Divine", "Mutoni"],
    dateOfBirth: "2015-01-09",
    sex: "FEMALE",
    district: "Kicukiro",
    parentRefs: ["NIDA-0004"],
  },
  {
    ref: "NIDA-0009",
    nationalId: "1200970031504128",
    names: ["Ange", "Iradukunda"],
    dateOfBirth: "2009-05-21",
    sex: "FEMALE",
    district: "Kicukiro",
    parentRefs: ["NIDA-0004"],
  },
  {
    // FR 4.2: a baby under 8 days old is Urgent without questions.
    ref: "NIDA-0010",
    nationalId: null,
    names: ["Keza", "Irakoze"],
    dateOfBirth: daysAgo(3),
    sex: "FEMALE",
    district: "Musanze",
    parentRefs: ["NIDA-0007"],
  },
  {
    // Appendix C group N: babies under 2 months get the extra question.
    ref: "NIDA-0011",
    nationalId: null,
    names: ["Bruno", "Mugabo"],
    dateOfBirth: daysAgo(35),
    sex: "MALE",
    district: "Huye",
    parentRefs: ["NIDA-0008"],
  },
  {
    ref: "NIDA-0006",
    nationalId: "1196070012689241",
    names: ["Esperance", "Mukamana"],
    dateOfBirth: "1960-12-25",
    sex: "FEMALE",
    district: "Nyarugenge",
    parentRefs: [],
  },
  {
    ref: "NIDA-0007",
    nationalId: "1200180054377109",
    names: ["Eric", "Niyonzima"],
    dateOfBirth: "2001-09-30",
    sex: "MALE",
    district: "Musanze",
    parentRefs: [],
  },
  {
    ref: "NIDA-0008",
    nationalId: "1199670078215135",
    names: ["Claudine", "Uwimana"],
    dateOfBirth: "1996-04-18",
    sex: "FEMALE",
    district: "Huye",
    parentRefs: [],
  },
];
