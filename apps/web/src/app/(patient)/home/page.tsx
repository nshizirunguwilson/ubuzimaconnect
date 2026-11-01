import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PiShieldCheckBold } from "react-icons/pi";
import { Avatar } from "@/components/app/avatar";
import { IdleLogout } from "@/components/app/idle-logout";
import { Logo } from "@/components/app/logo";
import { LogoutButton } from "@/components/app/logout-button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import Link from "next/link";
import { InstallApp } from "@/components/patient/install-app";
import { PiCaretRightBold, PiPhoneBold, PiPhoneCallBold } from "react-icons/pi";
import { BottomBar } from "@/components/app/bottom-bar";
import { ButtonLink } from "@/components/ui/button-link";
import { SquircleLink } from "@/components/ui/squircle-link";
import { apiGet, requirePatient } from "@/lib/session";
import { LanguageSwitch } from "@/i18n/client";
import { formatDateTimeIn } from "@/i18n/dates";
import { messages } from "@/i18n";
import { getLang } from "@/i18n/server";

type Mine = {
  people: { id: string; firstName: string; isSelf: boolean }[];
  open: {
    id: string;
    code: string;
    patientId: string;
    triageLevel: "URGENT" | "UNCERTAIN" | "MINOR" | null;
    status: string;
    createdAt: string;
    callRequested: boolean;
  }[];
};

export const metadata: Metadata = { title: "Home" };

export default function PatientHome() {
  return (
    <>
      <header className="flex items-center justify-between gap-4 lg:border-b lg:border-border lg:pb-4">
        <Logo href="/home" variant="compact" />
        <div className="flex items-center gap-2">
          <LanguageSwitch className="max-sm:hidden" />
          <LogoutButton to="/" />
        </div>
      </header>
      <Suspense fallback={<HomeSkeleton />}>
        <Home />
      </Suspense>
      <IdleLogout to="/login" />
    </>
  );
}

async function Home() {
  // Times are formatted with today's clock, so this renders per request, never at build time.
  await connection();
  const me = await requirePatient();
  const lang = await getLang();
  const t = messages[lang];
  const mine = await apiGet<Mine>("/cases/mine");
  const firstName = (id: string) => mine?.people.find((person) => person.id === id);
  const people = [
    { id: me.id, name: me.name, label: t.common.you, photoUrl: me.photoUrl },
    ...me.family.map((member) => ({
      id: member.id,
      name: member.name,
      label: t.home.yourChild(member.age),
      photoUrl: member.photoUrl,
    })),
  ];

  return (
    // From 1024 px: requests and actions on the left, the people this account covers on the right.
    <main className="flex flex-col gap-8 pt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-x-12 lg:gap-y-6">
      <h1 className="text-h1 text-fg lg:col-start-1">{t.home.hello(me.firstName)}</h1>

      {/* The current request is the one highlighted card. */}
      {mine && mine.open.length > 0 && (
        <div className="flex flex-col gap-3 lg:col-start-1">
          {mine.open.map((openCase, index) => {
            const name = firstName(openCase.patientId);
            const step =
              openCase.triageLevel === null
                ? t.home.notFinished
                : openCase.triageLevel === "URGENT"
                  ? t.home.urgent
                  : openCase.callRequested
                    ? t.home.willCall
                    : t.home.willReply;
            return (
              <SquircleLink
                key={openCase.id}
                href={`/cases/${openCase.id}`}
                radius="lg"
                className={`flex items-center gap-3 p-4 ${index === 0 ? "sq-bg-accent-soft sq-border-accent-line" : "sq-bg-surface sq-border-border"}`}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-caption text-fg-muted">
                    {name?.isSelf ? t.home.yourRequest : t.home.theirRequest(name?.firstName ?? "")} ·{" "}
                    {formatDateTimeIn(lang, openCase.createdAt)}
                  </span>
                  <span
                    className={`text-body font-semibold ${openCase.triageLevel === "URGENT" ? "text-urgent-fg" : "text-fg"}`}
                  >
                    {step}
                  </span>
                  <span className="font-mono text-caption font-medium text-fg-secondary">{openCase.code}</span>
                </div>
                <PiCaretRightBold className="size-5 shrink-0 text-fg-secondary" aria-hidden />
              </SquircleLink>
            );
          })}
        </div>
      )}

      <Link
        href="/emergency"
        className="inline-flex min-h-11 w-fit items-center gap-2 text-small font-semibold text-urgent-fg lg:col-start-1"
      >
        <PiPhoneBold className="size-4" aria-hidden />
        {t.common.emergencyCall912}
      </Link>

      {/* Not offered on a device that isn't the patient's */}
      {!me.sharedDevice && (
        <div className="lg:col-start-1">
          <InstallApp />
        </div>
      )}

      {me.sharedDevice && (
        <Notice tone="info" title={t.home.notYourDeviceTitle} className="lg:col-start-1">
          {t.home.notYourDeviceBody}
        </Notice>
      )}

      {/* Who the agent will see, and who this account can ask for help for. */}
      <section className="flex flex-col gap-3 lg:col-start-2 lg:row-span-6 lg:row-start-1" aria-labelledby="people">
        <div className="flex items-center justify-between gap-3">
          <h2 id="people" className="text-h2 text-fg">
            {t.home.people}
          </h2>
        </div>
        {/* Each person opens their records; a parent also sees their children's */}
        <Card className="flex flex-col divide-y divide-border p-0 md:p-0">
          {people.map((person) => (
            <Link
              key={person.id}
              href={`/records/${person.id}`}
              className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-sunken focus-visible:-outline-offset-2"
            >
              <Avatar src={person.photoUrl} name={person.name} size={44} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-semibold text-fg">{person.name}</span>
                <span className="text-small text-fg-secondary">{person.label}</span>
              </div>
              <span className="text-small font-medium text-link">{t.common.records}</span>
              <PiCaretRightBold className="size-5 shrink-0 text-fg-secondary" aria-hidden />
            </Link>
          ))}
        </Card>
        <p className="flex items-start gap-2 text-small text-fg-secondary">
          <PiShieldCheckBold className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          {t.home.checked}
          {me.district ? ` · ${t.home.district(me.district)}` : ""}.
        </p>
      </section>
      <BottomBar className="lg:col-start-1">
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/cases/new" variant="primary" className="w-full sm:w-auto">
            {t.home.getHelp}
          </ButtonLink>
          <ButtonLink href="/call" variant="secondary" icon={<PiPhoneCallBold />} className="w-full sm:w-auto">
            {t.home.preferCall}
          </ButtonLink>
        </div>
      </BottomBar>
    </main>
  );
}

function HomeSkeleton() {
  return (
    <main className="flex flex-col gap-8 pt-10" aria-busy>
      <div className="h-8 w-48 animate-pulse rounded-full bg-sunken" />
    </main>
  );
}
