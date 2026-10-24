import { greetingName, ROLE_LABEL } from "@ubuzima/shared";
import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import { requireStaff } from "@/lib/session";
import { ButtonLink } from "@/components/ui/button-link";
import { LuUserPlus } from "react-icons/lu";

export const metadata: Metadata = { title: "Home" };

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Kigali" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

export default function StaffHome() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const me = await requireStaff();
  // An agent's home is the queue (FR 6); a clinician's is their patients (FR 7.4).
  if (me.role === "AGENT") redirect("/staff/queue");
  if (me.role === "CLINICIAN") redirect("/staff/patients");
  return (
    <div className="flex flex-col gap-8">
      {/* RESEARCH R3: a greeting with one purpose line */}
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-fg">
          {greeting()}, {greetingName(me.name)}
        </h1>
        <p className="text-body text-fg-secondary">
          You&apos;re logged in as {ROLE_LABEL[me.role].toLowerCase()}
          {me.facility ? ` at ${me.facility.name}` : ""}.
        </p>
      </div>

      <Card className="flex max-w-[720px] flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-h3 text-fg">Your account</h2>
          <StatusBadge tone="success">Two-factor login on</StatusBadge>
        </div>
        <dl className="grid gap-x-6 gap-y-3 text-small sm:grid-cols-[160px_1fr]">
          <dt className="text-fg-secondary">Email</dt>
          <dd className="text-fg">{me.email}</dd>
          <dt className="text-fg-secondary">Role</dt>
          <dd className="text-fg">{ROLE_LABEL[me.role]}</dd>
          {me.facility && (
            <>
              <dt className="text-fg-secondary">Facility</dt>
              <dd className="text-fg">{me.facility.name}</dd>
            </>
          )}
        </dl>
      </Card>

      {me.role === "ADMIN" && (
        <ButtonLink href="/staff/team" variant="primary" icon={<LuUserPlus />} className="self-start">
          Invite staff
        </ButtonLink>
      )}
    </div>
  );
}
