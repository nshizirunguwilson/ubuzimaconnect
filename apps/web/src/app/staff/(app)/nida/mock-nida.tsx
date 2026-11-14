"use client";

import {
  DISTRICTS,
  formatNationalId,
  NIDA_ID_AGE,
  NIDA_PHOTO_MAX_BYTES,
  nidaAge,
  nidaPersonInput,
} from "@ubuzima/shared";
import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { LuCircleCheck, LuIdCard, LuImagePlus, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChoiceRow } from "@/components/ui/choice";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { check } from "@/lib/form";
import { formatDate } from "@/lib/time";

type Person = {
  ref: string;
  nationalId: string | null;
  names: string[];
  dateOfBirth: string;
  sex: "FEMALE" | "MALE";
  district: string;
  parentRefs: string[];
  addedAt?: string | null;
};
const blank = {
  names: "",
  sex: "",
  dateOfBirth: "",
  district: "",
  phone: "",
  parentRef: "",
};
const districts = Object.entries(DISTRICTS).flatMap(([province, list]) =>
  list.map((d) => ({ value: d, label: `${d} (${province})` })),
);

/**
 * D73: the administrator adds a made-up person to the mock NIDA, so a facilitator can log in as their own patient.
 * The same rules are checked here, in the API and in the mock NIDA.
 */
export function MockNida() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [form, setForm] = useState(blank);
  const [photo, setPhoto] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [added, setAdded] = useState<Person | null>(null);
  const load = useCallback(
    () =>
      api<Person[]>("/staff/nida/people").then(setPeople, () => setPeople([])),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const set =
    (k: keyof typeof blank) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));
  const child =
    !!form.dateOfBirth &&
    !Number.isNaN(Date.parse(form.dateOfBirth)) &&
    nidaAge(form.dateOfBirth) < NIDA_ID_AGE;
  const parents = (people ?? []).filter((p) => nidaAge(p.dateOfBirth) >= 18);

  function pickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type))
      return setErrors((x) => ({ ...x, photo: "Use a JPG or PNG photo" }));
    if (file.size > NIDA_PHOTO_MAX_BYTES)
      return setErrors((x) => ({
        ...x,
        photo: "The photo must be under 1 MB",
      }));
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto(String(reader.result));
      setErrors((x) =>
        Object.fromEntries(Object.entries(x).filter(([k]) => k !== "photo")),
      );
    };
    reader.readAsDataURL(file);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = {
      ...form,
      parentRef: child ? form.parentRef : "",
      photo: photo ?? undefined,
    };
    const r = check(nidaPersonInput, value);
    if (r.errors) return setErrors(r.errors);
    setErrors({});
    setPending(true);
    try {
      const person = await api<Person>("/staff/nida/people", value);
      setAdded(person);
      setForm(blank);
      setPhoto(null);
      toast.success(`${person.names.join(" ")} added to the mock NIDA`);
      await load();
    } catch (err) {
      if (err instanceof ApiFailure)
        setErrors(err.error.fields ?? { form: err.error.message });
      else setErrors({ form: "Couldn't add the person. Try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-fg">Mock NIDA</h1>
        <p className="max-w-2xl text-body text-fg-secondary">
          Add a made-up person to the practice identity records, then log in as
          them on the patient app with their ID, date of birth and one name.
          This is demo data only; the real NIDA is never touched.
        </p>
      </div>

      {added && (
        <Notice
          tone="success"
          title={`${added.names.join(" ")} can log in now`}
        >
          {added.nationalId ? (
            <>
              National ID{" "}
              <span className="font-mono font-semibold">
                {formatNationalId(added.nationalId)}
              </span>
              , born {formatDate(added.dateOfBirth)}, any one of their names.
            </>
          ) : (
            <>
              A child has no ID card of their own: log in as the parent and
              choose them under &quot;Who is sick?&quot;.
            </>
          )}
        </Notice>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <form onSubmit={submit} noValidate className="flex flex-col gap-5">
            <h2 className="text-h3 text-fg">Add a person</h2>
            {errors.form && <Notice tone="urgent" title={errors.form} />}
            <Input
              label="Names, as on the ID card"
              hint="Two to four names, e.g. Uwase Aline"
              value={form.names}
              onChange={set("names")}
              error={errors.names}
              autoComplete="off"
            />
            <Field label="Sex" error={errors.sex}>
              {() => (
                <div className="grid grid-cols-2 gap-2">
                  <ChoiceRow
                    name="sex"
                    value="FEMALE"
                    label="Female"
                    checked={form.sex === "FEMALE"}
                    onChange={set("sex")}
                  />
                  <ChoiceRow
                    name="sex"
                    value="MALE"
                    label="Male"
                    checked={form.sex === "MALE"}
                    onChange={set("sex")}
                  />
                </div>
              )}
            </Field>
            <Input
              label="Date of birth"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={form.dateOfBirth}
              onChange={set("dateOfBirth")}
              error={errors.dateOfBirth}
            />
            <Select
              label="District"
              placeholder="Choose a district"
              options={districts}
              value={form.district}
              onChange={set("district")}
              error={errors.district}
            />
            <Input
              label="Phone"
              optional
              hint="A Rwandan mobile number, pre-filled when they ask for a call"
              inputMode="tel"
              value={form.phone}
              onChange={set("phone")}
              error={errors.phone}
            />
            {child && (
              <Select
                label="Parent"
                hint={`Under ${NIDA_ID_AGE}: no ID card of their own, reached through a parent`}
                placeholder="Choose a parent"
                options={parents.map((p) => ({
                  value: p.ref,
                  label: `${p.names.join(" ")} · born ${formatDate(p.dateOfBirth)}`,
                }))}
                value={form.parentRef}
                onChange={set("parentRef")}
                error={errors.parentRef}
              />
            )}
            <Field
              label="Photo"
              optional
              hint="JPG or PNG, under 1 MB. Without one, a plain silhouette is shown."
              error={errors.photo}
            >
              {({ id }) => (
                <div className="flex items-center gap-4">
                  {photo ? (
                    // A data URL preview of the chosen file; nothing is uploaded until the form is sent.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo}
                      alt="Chosen photo"
                      className="size-20 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex size-20 items-center justify-center rounded-lg bg-sunken text-fg-muted">
                      <LuIdCard className="size-8" aria-hidden />
                    </span>
                  )}
                  <label
                    htmlFor={id}
                    className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-border-strong px-4 text-small font-medium text-fg hover:bg-sunken"
                  >
                    <LuImagePlus className="size-5" aria-hidden />
                    {photo ? "Choose another" : "Choose a photo"}
                  </label>
                  <input
                    id={id}
                    type="file"
                    accept="image/jpeg,image/png"
                    className="sr-only"
                    onChange={pickPhoto}
                  />
                  {photo && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove the photo"
                      onClick={() => setPhoto(null)}
                    >
                      <LuX />
                    </Button>
                  )}
                </div>
              )}
            </Field>
            <Button
              type="submit"
              variant="primary"
              loading={pending}
              icon={<LuCircleCheck />}
              className="self-start"
            >
              Add to the mock NIDA
            </Button>
          </form>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-h3 text-fg">People in the mock NIDA</h2>
          <p className="text-small text-fg-secondary">
            Newest additions first, then the built-in demo people.
          </p>
          <ul className="divide-y divide-border text-small">
            {people === null && <li className="h-24" aria-busy />}
            {people?.map((p) => (
              <li
                key={p.ref}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
              >
                <span className="flex flex-col">
                  <span className="font-medium text-fg">
                    {p.names.join(" ")}
                  </span>
                  <span className="text-caption text-fg-secondary">
                    Born {formatDate(p.dateOfBirth)} ·{" "}
                    {p.sex === "FEMALE" ? "Female" : "Male"} · {p.district}
                    {p.parentRefs.length
                      ? ` · child of ${people.find((x) => x.ref === p.parentRefs[0])?.names.join(" ") ?? p.parentRefs[0]}`
                      : ""}
                  </span>
                </span>
                <span className="font-mono text-caption text-fg-secondary">
                  {p.nationalId
                    ? formatNationalId(p.nationalId)
                    : "No ID (child)"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
