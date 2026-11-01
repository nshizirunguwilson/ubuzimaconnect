import { NIDA_ID_AGE, nidaAge, type NidaPersonInput } from "@ubuzima/shared";
import { randomInt } from "node:crypto";
import pg from "pg";
import { citizens, type Citizen } from "./citizens";

/**
 * People added through the administrator's form, kept in their own `nida` schema. The seeded
 * citizens stay in code; a lookup checks both. Every query passes its values as parameters ($1, $2, ...), never
 * joined into the SQL text, so nothing a user types can change a query.
 */
export type StoredCitizen = Citizen & { phone: string | null; photo: Buffer | null; photoType: string | null; addedAt: string | null };

const url = process.env.NIDA_DATABASE_URL;
const pool = url ? new pg.Pool({ connectionString: url, max: 3 }) : null;
let ready: Promise<void> | null = null;

function init() {
  ready ??= (async () => {
    if (!pool) return;
    // In production the schema is made by the database owner, and this service's own user (nida_svc) may only
    // work inside it: "create schema if not exists" would still need rights on the whole database.
    const { rowCount } = await pool.query(`select 1 from pg_namespace where nspname = 'nida'`);
    if (!rowCount) await pool.query(`create schema nida`);
    await pool.query(`create sequence if not exists nida.person_ref start 1001`);
    await pool.query(`
      create table if not exists nida.person (
        ref text primary key,
        national_id char(16) unique,
        names text[] not null,
        date_of_birth date not null,
        sex text not null check (sex in ('FEMALE', 'MALE')),
        district text not null,
        phone text,
        parent_refs text[] not null default '{}',
        photo bytea,
        photo_type text check (photo_type in ('image/jpeg', 'image/png')),
        added_at timestamptz not null default now()
      )`);
  })();
  return ready;
}

type Row = {
  ref: string;
  national_id: string | null;
  names: string[];
  date_of_birth: string;
  sex: "FEMALE" | "MALE";
  district: string;
  phone: string | null;
  parent_refs: string[];
  photo: Buffer | null;
  photo_type: string | null;
  added_at: Date;
};
const COLUMNS = `ref, national_id, names, to_char(date_of_birth, 'YYYY-MM-DD') as date_of_birth,
  sex, district, phone, parent_refs, photo, photo_type, added_at`;

function fromRow(row: Row): StoredCitizen {
  return {
    ref: row.ref,
    nationalId: row.national_id,
    names: row.names,
    dateOfBirth: row.date_of_birth,
    sex: row.sex,
    district: row.district,
    parentRefs: row.parent_refs,
    phone: row.phone,
    photo: row.photo,
    photoType: row.photo_type,
    addedAt: row.added_at.toISOString(),
  };
}

/** A built-in demo person, in the same shape as someone added through the form. */
function seeded(citizen: Citizen): StoredCitizen {
  return { ...citizen, phone: null, photo: null, photoType: null, addedAt: null };
}

export async function byNationalId(nationalId: string): Promise<StoredCitizen | null> {
  const builtIn = citizens.find((citizen) => citizen.nationalId === nationalId);
  if (builtIn) return seeded(builtIn);
  if (!pool) return null;
  await init();
  const { rows } = await pool.query<Row>(`select ${COLUMNS} from nida.person where national_id = $1`, [nationalId]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function byRef(ref: string): Promise<StoredCitizen | null> {
  const builtIn = citizens.find((citizen) => citizen.ref === ref);
  if (builtIn) return seeded(builtIn);
  if (!pool) return null;
  await init();
  const { rows } = await pool.query<Row>(`select ${COLUMNS} from nida.person where ref = $1`, [ref]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function childrenOf(ref: string): Promise<StoredCitizen[]> {
  const fromCode = citizens.filter((citizen) => citizen.parentRefs.includes(ref)).map(seeded);
  if (!pool) return fromCode;
  await init();
  const { rows } = await pool.query<Row>(
    `select ${COLUMNS} from nida.person where $1 = any(parent_refs) order by date_of_birth`,
    [ref],
  );
  return [...fromCode, ...rows.map(fromRow)];
}

/** Everyone, newest additions first: for the administrator's list and the choice of a parent. */
export async function everyone(): Promise<StoredCitizen[]> {
  const fromCode = citizens.map(seeded);
  if (!pool) return fromCode;
  await init();
  const { rows } = await pool.query<Row>(`select ${COLUMNS} from nida.person order by added_at desc limit 500`);
  return [...rows.map(fromRow), ...fromCode];
}

const MIN_PARENT_AGE_GAP_YEARS = 12;
const ID_ATTEMPTS = 5;
const UNIQUE_VIOLATION = "23505"; // Postgres's error code when a unique column already has the value

/**
 * A new ID in the card's format: 1 (Rwandan), the year of birth, 7 for female or 8 for male, a 7-digit
 * birth-order number, 1 (first card) and two check digits. The check digits are invented, as for the built-in
 * people. Uniqueness is guaranteed by the database: a clash is refused, and add() then draws again.
 */
function newNationalId(person: NidaPersonInput) {
  const birthOrder = String(randomInt(0, 10_000_000)).padStart(7, "0");
  const checkDigits = String(randomInt(0, 100)).padStart(2, "0");
  const sexDigit = person.sex === "FEMALE" ? 7 : 8;
  return `1${person.dateOfBirth.slice(0, 4)}${sexDigit}${birthOrder}1${checkDigits}`;
}

export class NidaInputError extends Error {}

/** Adds a person. Someone 16 or older gets a new ID number; a younger child is linked to a parent instead. */
export async function add(
  person: NidaPersonInput,
  photo: { bytes: Buffer; type: "image/jpeg" | "image/png" } | null,
): Promise<StoredCitizen> {
  if (!pool) throw new NidaInputError("This mock NIDA has no database (NIDA_DATABASE_URL), so it can't add people.");
  await init();

  if (person.parentRef) {
    const parent = await byRef(person.parentRef);
    if (!parent) throw new NidaInputError("That parent isn't in the identity records.");
    const ageGap = nidaAge(parent.dateOfBirth) - nidaAge(person.dateOfBirth);
    if (ageGap < MIN_PARENT_AGE_GAP_YEARS) {
      throw new NidaInputError("A parent must be at least 12 years older than the child.");
    }
  }

  const getsIdCard = nidaAge(person.dateOfBirth) >= NIDA_ID_AGE;

  for (let attempt = 0; attempt < ID_ATTEMPTS; attempt++) {
    const nationalId = getsIdCard ? newNationalId(person) : null;
    const clashesWithBuiltIn = nationalId !== null && citizens.some((citizen) => citizen.nationalId === nationalId);
    if (clashesWithBuiltIn) continue; // draw again

    try {
      const { rows } = await pool.query<Row>(
        `insert into nida.person (ref, national_id, names, date_of_birth, sex, district, phone, parent_refs, photo, photo_type)
         values ('NIDA-' || nextval('nida.person_ref'), $1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning ${COLUMNS}`,
        [
          nationalId,
          person.names,
          person.dateOfBirth,
          person.sex,
          person.district,
          person.phone ?? null,
          person.parentRef ? [person.parentRef] : [],
          photo?.bytes ?? null,
          photo?.type ?? null,
        ],
      );
      return fromRow(rows[0]);
    } catch (error) {
      const sameIdDrawnTwice = (error as { code?: string }).code === UNIQUE_VIOLATION && getsIdCard;
      if (sameIdDrawnTwice) continue;
      throw error;
    }
  }
  throw new Error("Couldn't draw a unique ID");
}
