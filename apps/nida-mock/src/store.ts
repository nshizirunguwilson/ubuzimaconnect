import { NIDA_ID_AGE, nidaAge, type NidaPersonInput } from "@ubuzima/shared";
import { randomInt } from "node:crypto";
import pg from "pg";
import { citizens, type Citizen } from "./citizens";

/**
 * People added through the administrator's form (DECISIONS.md D73), kept in their own `nida` schema. The seeded
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
    await pool.query(`create schema if not exists nida`);
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
const COLUMNS = `ref, national_id, names, to_char(date_of_birth, 'YYYY-MM-DD') as date_of_birth, sex, district, phone, parent_refs, photo, photo_type, added_at`;
const fromRow = (r: Row): StoredCitizen => ({
  ref: r.ref,
  nationalId: r.national_id,
  names: r.names,
  dateOfBirth: r.date_of_birth,
  sex: r.sex,
  district: r.district,
  parentRefs: r.parent_refs,
  phone: r.phone,
  photo: r.photo,
  photoType: r.photo_type,
  addedAt: r.added_at.toISOString(),
});
const seeded = (c: Citizen): StoredCitizen => ({ ...c, phone: null, photo: null, photoType: null, addedAt: null });

export async function byNationalId(nationalId: string): Promise<StoredCitizen | null> {
  const c = citizens.find((x) => x.nationalId === nationalId);
  if (c) return seeded(c);
  if (!pool) return null;
  await init();
  const { rows } = await pool.query<Row>(`select ${COLUMNS} from nida.person where national_id = $1`, [nationalId]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function byRef(ref: string): Promise<StoredCitizen | null> {
  const c = citizens.find((x) => x.ref === ref);
  if (c) return seeded(c);
  if (!pool) return null;
  await init();
  const { rows } = await pool.query<Row>(`select ${COLUMNS} from nida.person where ref = $1`, [ref]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function childrenOf(ref: string): Promise<StoredCitizen[]> {
  const fromCode = citizens.filter((x) => x.parentRefs.includes(ref)).map(seeded);
  if (!pool) return fromCode;
  await init();
  const { rows } = await pool.query<Row>(`select ${COLUMNS} from nida.person where $1 = any(parent_refs) order by date_of_birth`, [ref]);
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

/**
 * A new ID in the card's format: 1 (Rwandan) · year of birth · 7 female or 8 male · a 7-digit birth-order number ·
 * 1 (first card) · two check digits. The check digits are invented, as for the seeded people. Unique by construction:
 * the database's unique constraint refuses a clash, and a clash is retried.
 */
function newNationalId(p: NidaPersonInput) {
  const order = String(randomInt(0, 10_000_000)).padStart(7, "0");
  const check = String(randomInt(0, 100)).padStart(2, "0");
  return `1${p.dateOfBirth.slice(0, 4)}${p.sex === "FEMALE" ? 7 : 8}${order}1${check}`;
}

export class NidaInputError extends Error {}

export async function add(p: NidaPersonInput, photo: { bytes: Buffer; type: "image/jpeg" | "image/png" } | null): Promise<StoredCitizen> {
  if (!pool) throw new NidaInputError("This mock NIDA has no database (NIDA_DATABASE_URL), so it can't add people.");
  await init();
  if (p.parentRef) {
    const parent = await byRef(p.parentRef);
    if (!parent) throw new NidaInputError("That parent isn't in the identity records.");
    if (nidaAge(parent.dateOfBirth) - nidaAge(p.dateOfBirth) < 12) throw new NidaInputError("A parent must be at least 12 years older than the child.");
  }
  const hasId = nidaAge(p.dateOfBirth) >= NIDA_ID_AGE;
  for (let attempt = 0; attempt < 5; attempt++) {
    let nationalId = hasId ? newNationalId(p) : null;
    if (nationalId && citizens.some((c) => c.nationalId === nationalId)) nationalId = null; // a seeded ID: draw again
    if (hasId && !nationalId) continue;
    try {
      const { rows } = await pool.query<Row>(
        `insert into nida.person (ref, national_id, names, date_of_birth, sex, district, phone, parent_refs, photo, photo_type)
         values ('NIDA-' || nextval('nida.person_ref'), $1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning ${COLUMNS}`,
        [nationalId, p.names, p.dateOfBirth, p.sex, p.district, p.phone ?? null, p.parentRef ? [p.parentRef] : [], photo?.bytes ?? null, photo?.type ?? null],
      );
      return fromRow(rows[0]);
    } catch (e) {
      if ((e as { code?: string }).code === "23505" && hasId) continue; // the same ID drawn twice: try another
      throw e;
    }
  }
  throw new Error("Couldn't draw a unique ID");
}
