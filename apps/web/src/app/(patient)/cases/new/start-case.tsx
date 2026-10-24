"use client";

import { DISTRICTS, sectorsOf, type CaseLocation } from "@ubuzima/shared";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LuLocateFixed, LuMapPin, LuPhone } from "react-icons/lu";
import { BottomBar } from "@/components/app/bottom-bar";
import { BackButton, BackLink } from "@/components/patient/back-link";
import { SavedFacilities } from "@/components/patient/saved-facilities";
import { ButtonLink } from "@/components/ui/button-link";
import { Button } from "@/components/ui/button";
import { ChoiceRow } from "@/components/ui/choice";
import { Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { StepProgress } from "@/components/ui/step-progress";
import { api, ApiFailure } from "@/lib/api";
import { saveNearby, type NearbyFacility } from "@/lib/nearby";
import { useOnline } from "@/lib/online";
import { usePending } from "@/lib/pending";
import { useT } from "@/i18n/client";

type Person = { id: string; name: string; label: string; self: boolean };
type Gps = { state: "idle" | "asking" | "ok" | "failed"; coords?: { latitude: number; longitude: number }; why?: string };

const provinces = Object.keys(DISTRICTS);

/**
 * FR 3.1 to 3.5: who is sick (only when there is a choice), then where they are. GPS first;
 * if it fails or is refused, Province → District → Sector (FR 3.4). One thing per screen.
 */
export function StartCase({ people, preselected, sharedDevice }: { people: Person[]; preselected: string | null; sharedDevice: boolean }) {
  const router = useRouter();
  const { t, tr } = useT();
  const askWho = people.length > 1 && !people.some((p) => p.id === preselected);
  const [step, setStep] = useState<"who" | "where">(askWho ? "who" : "where");
  const [who, setWho] = useState(preselected ?? (people.length === 1 ? people[0].id : ""));
  const [gps, setGps] = useState<Gps>({ state: "idle" });
  const [manual, setManual] = useState(false);
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [sector, setSector] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = usePending(false);
  const [waiting, setWaiting] = useState(false);
  const online = useOnline();
  const total = askWho ? 2 : 1;
  const person = people.find((p) => p.id === who);

  function locate() {
    if (!navigator.geolocation) return setGps({ state: "failed", why: t.start.cantShare });
    setGps({ state: "asking" });
    navigator.geolocation.getCurrentPosition(
      (p) => setGps({ state: "ok", coords: { latitude: p.coords.latitude, longitude: p.coords.longitude } }),
      (e) => {
        setGps({ state: "failed", why: e.code === e.PERMISSION_DENIED ? t.start.refused : t.start.notFound });
        setManual(true);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  async function start() {
    let location: CaseLocation;
    if (!manual && gps.state === "ok" && gps.coords) location = { source: "GPS", ...gps.coords };
    else if (sector) location = { source: "MANUAL", sectorCode: sector };
    else return setError(manual ? tr("Choose your sector") : t.start.shareOrChoose);
    setError(undefined);
    setPending(true);
    try {
      const r = await api<{ id: string; existing: boolean; nearby?: NearbyFacility[] }>("/cases", { subjectId: who, location });
      if (r.nearby) saveNearby(r.nearby, sharedDevice);
      router.replace(`/cases/${r.id}`);
    } catch (e) {
      setPending(false);
      // FR 3.10, use case 5: no connection. The request waits here and starts by itself when it's back.
      if (e instanceof ApiFailure && e.status === 0) return setWaiting(true);
      setError(e instanceof ApiFailure ? (e.error.fields?.["location.latitude"] ? t.start.outside : tr(e.error.message)) : t.common.somethingWrong);
    }
  }

  if (waiting) {
    return (
      <WaitingToStart
        online={online}
        retry={() => {
          setWaiting(false);
          void start();
        }}
      />
    );
  }

  if (step === "who") {
    return (
      <main className="flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-[480px]">
        <BackLink href="/home" />
        <StepProgress current={1} total={total} text={t.common.step(1, total)} />
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-h1 font-heading font-semibold text-fg">{t.start.whoIsSick}</legend>
          {people.map((p) => (
            <ChoiceRow key={p.id} name="who" value={p.id} label={p.label} checked={who === p.id} onChange={() => setWho(p.id)} />
          ))}
        </fieldset>
        <div className="flex-1" />
        <BottomBar>
          <Button variant="primary" disabled={!who} onClick={() => setStep("where")} className="w-full sm:w-auto sm:self-start">
            {t.common.continue}
          </Button>
        </BottomBar>
      </main>
    );
  }

  const districtOptions = province ? DISTRICTS[province].map((d) => ({ value: d, label: d })) : [];
  const sectorOptions = district ? sectorsOf(district).map((s) => ({ value: s.code, label: s.name })) : [];

  return (
    <main className="flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-[480px]">
      {askWho ? (
        <BackButton onClick={() => setStep("who")} />
      ) : (
        <BackLink href="/home" />
      )}
      <StepProgress current={total} total={total} text={t.common.step(total, total)} />
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-fg">{person && !person.self ? t.start.whereIs(person.name.split(" ")[0]) : t.start.whereAreYou}</h1>
        <p className="text-body text-fg-secondary">{t.start.why}</p>
      </div>

      {!manual && (
        <div className="flex flex-col gap-3">
          {gps.state === "ok" ? (
            <Notice tone="success" title={t.start.found}>
              {t.start.foundBody}
            </Notice>
          ) : (
            <Button variant="secondary" icon={<LuLocateFixed />} loading={gps.state === "asking"} onClick={locate} className="w-full sm:w-auto sm:self-start">
              {gps.state === "asking" ? t.start.finding : t.start.useLocation}
            </Button>
          )}
          <button type="button" onClick={() => setManual(true)} className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 text-small font-medium text-link underline underline-offset-2">
            <LuMapPin className="size-4" aria-hidden />
            {t.start.chooseFromList}
          </button>
        </div>
      )}

      {manual && (
        <div className="flex flex-col gap-5">
          {gps.state === "failed" && (
            <Notice tone="info" title={gps.why ?? t.start.notFound}>
              {t.start.chooseInstead}
            </Notice>
          )}
          <Select
            label={t.start.province}
            placeholder={t.start.chooseProvince}
            options={provinces.map((p) => ({ value: p, label: p }))}
            value={province}
            onChange={(e) => {
              setProvince(e.target.value);
              setDistrict("");
              setSector("");
            }}
          />
          {province && (
            <Select
              label={t.start.district}
              placeholder={t.start.chooseDistrict}
              options={districtOptions}
              value={district}
              onChange={(e) => {
                setDistrict(e.target.value);
                setSector("");
              }}
            />
          )}
          {district && <Select label={t.start.sector} placeholder={t.start.chooseSector} options={sectorOptions} value={sector} onChange={(e) => setSector(e.target.value)} error={error} />}
          {gps.state !== "failed" && (
            <button type="button" onClick={() => setManual(false)} className="inline-flex min-h-11 w-fit cursor-pointer items-center text-small font-medium text-link underline underline-offset-2">
              {t.start.useLocationInstead}
            </button>
          )}
        </div>
      )}

      {error && !(manual && district) && <p className="text-small font-medium text-urgent-fg">{error}</p>}
      <div className="flex-1" />
      <BottomBar>
        <Button variant="primary" loading={pending} onClick={start} className="w-full sm:w-auto sm:self-start">
          {t.common.continue}
        </Button>
      </BottomBar>
    </main>
  );
}

/**
 * FR 3.10: no connection when starting. Tries again by itself when the connection comes back; if the
 * browser thinks it is online but the server can't be reached, the patient can try again.
 */
function WaitingToStart({ online, retry }: { online: boolean; retry: () => void }) {
  const wasOnline = useRef(online);
  const { t } = useT();
  useEffect(() => {
    if (online && !wasOnline.current) retry();
    wasOnline.current = online;
  }, [online, retry]);
  return (
    <main className="flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-[480px]">
      <BackLink href="/home" />
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-fg">{t.offline.notSent}</h1>
        <p className="text-body text-fg-secondary">{t.offline.startsByItself}</p>
      </div>
      <ButtonLink href="tel:912" variant="danger" icon={<LuPhone />} className="h-14 w-full text-body md:h-14">
        {t.common.call912}
      </ButtonLink>
      <SavedFacilities />
      {online && (
        <Button variant="secondary" onClick={retry} className="self-start">
          {t.common.tryAgain}
        </Button>
      )}
    </main>
  );
}
