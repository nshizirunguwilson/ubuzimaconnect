import { ROLE_LABEL, type StaffMe } from "@ubuzima/shared";
import { Suspense } from "react";
import { LuBuilding2, LuCalendarDays, LuCalendarClock, LuHouse, LuInbox, LuListChecks, LuSettings, LuStethoscope, LuUsers, LuUsersRound, LuPill, LuHistory, LuActivity, LuBell, LuChartColumn } from "react-icons/lu";
import { AgentPresence } from "@/components/app/agent-presence";
import { AdminAlerts } from "@/components/app/admin-alerts";
import { ClinicianNotices } from "@/components/app/clinician-notices";
import { IdleLogout } from "@/components/app/idle-logout";
import { Logo } from "@/components/app/logo";
import { LogoutButton } from "@/components/app/logout-button";
import { StaffNav, type NavItem } from "@/components/app/staff-nav";
import { Squircle } from "@/components/ui/squircle";
import { requireStaff } from "@/lib/session";

/** Only screens that exist are listed; each batch adds its own items (docs/TRACEABILITY.md). */
function navFor(role: StaffMe["role"]): NavItem[] {
  const home: NavItem = { href: "/staff", label: "Home", icon: <LuHouse /> };
  switch (role) {
    case "ADMIN":
      return [
        home,
        { href: "/staff/alerts", label: "Alerts", icon: <LuBell /> },
        { href: "/staff/facilities", label: "Facilities", icon: <LuBuilding2 /> },
        { href: "/staff/team", label: "Staff accounts", icon: <LuUsers /> },
        { href: "/staff/on-duty", label: "On duty", icon: <LuActivity /> },
        { href: "/staff/schedule", label: "Agent schedule", icon: <LuCalendarDays /> },
        { href: "/staff/red-flags", label: "Red-flag list", icon: <LuListChecks /> },
        { href: "/staff/activity", label: "Activity", icon: <LuHistory /> },
        { href: "/staff/reports", label: "Reports", icon: <LuChartColumn /> },
        { href: "/staff/settings", label: "Settings", icon: <LuSettings /> },
      ];
    case "FACILITY_MANAGER":
      return [
        home,
        { href: "/staff/facility", label: "Facility profile", icon: <LuBuilding2 /> },
        { href: "/staff/clinicians", label: "Clinicians", icon: <LuStethoscope /> },
        { href: "/staff/schedule", label: "Schedule", icon: <LuCalendarDays /> },
        { href: "/staff/activity", label: "Staff activity", icon: <LuHistory /> },
        { href: "/staff/reports", label: "Reports", icon: <LuChartColumn /> },
      ];
    case "AGENT":
      return [
        { href: "/staff/queue", label: "Queue", icon: <LuInbox /> },
        { href: "/staff/prescriptions", label: "My prescriptions", icon: <LuPill /> },
        { href: "/staff/reports", label: "Reports", icon: <LuChartColumn /> },
        { href: "/staff/shifts", label: "My shifts", icon: <LuCalendarClock /> },
      ];
    case "CLINICIAN":
      return [
        { href: "/staff/patients", label: "Patients", icon: <LuUsersRound /> },
        { href: "/staff/prescriptions", label: "My prescriptions", icon: <LuPill /> },
        { href: "/staff/reports", label: "Reports", icon: <LuChartColumn /> },
        { href: "/staff/shifts", label: "My shifts", icon: <LuCalendarClock /> },
      ];
  }
}

/** DESIGN.md §4: a 240 px navigation panel on the left, content up to 1200 px. */
export default function StaffAppLayout({ children }: LayoutProps<"/staff">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy />}>
      <Shell>{children}</Shell>
      <IdleLogout to="/staff/login" />
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  const items = navFor(me.role);
  return (
    // DECISIONS.md D18: the navigation is a floating squircle panel with a 12 px margin on
    // every side, so it reads as one object instead of a strip glued to the screen edge.
    <div className="min-h-dvh p-3 md:grid md:grid-cols-[240px_1fr] md:gap-3">
      <Squircle
        as="aside"
        radius="xl"
        className="flex flex-col gap-4 px-4 py-3 sq-bg-surface sq-border-border md:sticky md:top-3 md:h-[calc(100dvh-1.5rem)] md:gap-8 md:px-4 md:py-6"
      >
        <div className="flex items-center justify-between md:px-1">
          {/* 18 px tall: the name is 187 px wide, which fits the 240 px sidebar with its padding */}
          <Logo href="/staff" variant="compact" height={18} />
          <div className="md:hidden">
            <LogoutButton to="/staff/login" />
          </div>
        </div>
        {items.length > 1 && <StaffNav items={items} className="md:flex-1" />}
        <div className="hidden flex-col gap-3 border-t border-border pt-4 md:mt-auto md:flex">
          <div className="flex flex-col px-3">
            <span className="truncate text-small font-semibold text-fg">{me.name}</span>
            <span className="truncate text-caption text-fg-secondary">{ROLE_LABEL[me.role]}</span>
          </div>
          <LogoutButton to="/staff/login" />
        </div>
      </Squircle>
      <main className="mx-auto w-full max-w-[1200px] px-1 py-6 md:px-6 md:py-7">{children}</main>
      {me.role === "AGENT" && <AgentPresence />}
      {me.role === "CLINICIAN" && <ClinicianNotices />}
      {me.role === "ADMIN" && <AdminAlerts />}
    </div>
  );
}
