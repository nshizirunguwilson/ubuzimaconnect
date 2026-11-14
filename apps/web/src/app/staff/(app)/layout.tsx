import { ROLE_LABEL, type StaffMe } from "@ubuzima/shared";
import { Suspense } from "react";
import { LuBuilding2, LuCalendarDays, LuCalendarClock, LuHouse, LuInbox, LuListChecks, LuSettings, LuStethoscope, LuUsers, LuUsersRound, LuPill, LuHistory, LuActivity, LuBell, LuChartColumn, LuIdCard } from "react-icons/lu";
import { AgentPresence } from "@/components/app/agent-presence";
import { AdminAlerts } from "@/components/app/admin-alerts";
import { ClinicianNotices } from "@/components/app/clinician-notices";
import { IdleLogout } from "@/components/app/idle-logout";
import { StaffFrame } from "@/components/app/staff-frame";
import type { NavItem } from "@/components/app/staff-nav";
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
        { href: "/staff/nida", label: "Mock NIDA", icon: <LuIdCard /> },
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
    // DECISIONS.md D18, D71: the floating navigation panel, foldable to its icons from 768 px.
    <StaffFrame items={items} name={me.name} role={ROLE_LABEL[me.role]}>
      <main className="mx-auto w-full max-w-[1200px] px-1 py-6 md:px-6 md:py-7">{children}</main>
      {me.role === "AGENT" && <AgentPresence />}
      {me.role === "CLINICIAN" && <ClinicianNotices />}
      {me.role === "ADMIN" && <AdminAlerts />}
    </StaffFrame>
  );
}
