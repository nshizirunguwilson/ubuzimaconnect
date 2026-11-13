import { ROLE_LABEL, type StaffMe } from "@ubuzima/shared";
import { Suspense } from "react";
import {
  PiBuildingsBold,
  PiCalendarBold,
  PiCalendarDotsBold,
  PiHouseBold,
  PiTrayBold,
  PiListChecksBold,
  PiGearSixBold,
  PiStethoscopeBold,
  PiUsersBold,
  PiUsersThreeBold,
  PiPillBold,
  PiClockCounterClockwiseBold,
  PiPulseBold,
  PiBellBold,
  PiChartBarBold,
  PiIdentificationCardBold,
} from "react-icons/pi";
import { AgentPresence } from "@/components/app/agent-presence";
import { AdminAlerts } from "@/components/app/admin-alerts";
import { ClinicianNotices } from "@/components/app/clinician-notices";
import { IdleLogout } from "@/components/app/idle-logout";
import { StaffFrame } from "@/components/app/staff-frame";
import type { NavItem } from "@/components/app/staff-nav";
import { requireStaff } from "@/lib/session";
import { Loading } from "@/components/ui/loading";

/** Only screens that exist are listed; each batch adds its own items (docs/TRACEABILITY.md). */
function navFor(role: StaffMe["role"]): NavItem[] {
  const home: NavItem = { href: "/staff", label: "Home", icon: <PiHouseBold /> };
  switch (role) {
    case "ADMIN":
      return [
        home,
        { href: "/staff/alerts", label: "Alerts", icon: <PiBellBold /> },
        { href: "/staff/facilities", label: "Facilities", icon: <PiBuildingsBold /> },
        { href: "/staff/team", label: "Staff accounts", icon: <PiUsersBold /> },
        { href: "/staff/nida", label: "Mock NIDA", icon: <PiIdentificationCardBold /> },
        { href: "/staff/on-duty", label: "On duty", icon: <PiPulseBold /> },
        { href: "/staff/schedule", label: "Agent schedule", icon: <PiCalendarBold /> },
        { href: "/staff/red-flags", label: "Red-flag list", icon: <PiListChecksBold /> },
        { href: "/staff/activity", label: "Activity", icon: <PiClockCounterClockwiseBold /> },
        { href: "/staff/reports", label: "Reports", icon: <PiChartBarBold /> },
        { href: "/staff/settings", label: "Settings", icon: <PiGearSixBold /> },
      ];
    case "FACILITY_MANAGER":
      return [
        home,
        { href: "/staff/facility", label: "Facility profile", icon: <PiBuildingsBold /> },
        { href: "/staff/clinicians", label: "Clinicians", icon: <PiStethoscopeBold /> },
        { href: "/staff/schedule", label: "Schedule", icon: <PiCalendarBold /> },
        { href: "/staff/activity", label: "Staff activity", icon: <PiClockCounterClockwiseBold /> },
        { href: "/staff/reports", label: "Reports", icon: <PiChartBarBold /> },
      ];
    case "AGENT":
      return [
        { href: "/staff/queue", label: "Queue", icon: <PiTrayBold /> },
        { href: "/staff/prescriptions", label: "My prescriptions", icon: <PiPillBold /> },
        { href: "/staff/reports", label: "Reports", icon: <PiChartBarBold /> },
        { href: "/staff/shifts", label: "My shifts", icon: <PiCalendarDotsBold /> },
      ];
    case "CLINICIAN":
      return [
        { href: "/staff/patients", label: "Patients", icon: <PiUsersThreeBold /> },
        { href: "/staff/prescriptions", label: "My prescriptions", icon: <PiPillBold /> },
        { href: "/staff/reports", label: "Reports", icon: <PiChartBarBold /> },
        { href: "/staff/shifts", label: "My shifts", icon: <PiCalendarDotsBold /> },
      ];
  }
}

/** A 240 px navigation panel on the left, content up to 1200 px. */
export default function StaffAppLayout({ children }: LayoutProps<"/staff">) {
  return (
    <Suspense fallback={<Loading className="min-h-dvh" />}>
      <Shell>{children}</Shell>
      <IdleLogout to="/staff/login" />
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  const items = navFor(me.role);
  return (
    // The floating navigation panel, foldable to its icons from 768 px.
    <StaffFrame items={items} name={me.name} role={ROLE_LABEL[me.role]}>
      <main className="mx-auto w-full max-w-[1200px] px-1 py-6 md:px-6 md:py-7">{children}</main>
      {me.role === "AGENT" && <AgentPresence />}
      {me.role === "CLINICIAN" && <ClinicianNotices />}
      {me.role === "ADMIN" && <AdminAlerts />}
    </StaffFrame>
  );
}
