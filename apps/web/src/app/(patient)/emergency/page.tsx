import type { Metadata } from "next";
import Link from "next/link";
import { PiArrowLeftBold, PiPhoneBold } from "react-icons/pi";
import { ButtonLink } from "@/components/ui/button-link";
import { NearestEmergency } from "./nearest";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Emergency" };

/**
 * Emergency help without logging in. 912 is Rwanda's free ambulance number (SAMU).
 * This is the only page that uses the Display text size and a red primary action.
 */
export default async function Emergency() {
  const t = await getT();
  return (
    <main className="flex flex-1 flex-col gap-8 lg:mx-auto lg:w-full lg:max-w-[480px]">
      <Link
        href="/"
        className="-ml-2 inline-flex min-h-11 w-fit items-center gap-2 px-2 text-small font-medium text-fg"
      >
        <PiArrowLeftBold className="size-5" aria-hidden />
        {t.common.back}
      </Link>
      <div className="flex flex-col gap-3">
        <h1 className="text-display text-urgent-fg">{t.emergency.title}</h1>
        <p className="text-body text-fg">{t.emergency.when}</p>
      </div>
      <ButtonLink href="tel:912" variant="danger" icon={<PiPhoneBold />} className="h-14 w-full text-body md:h-14">
        {t.common.call912}
      </ButtonLink>
      <NearestEmergency />
      <p className="text-small text-fg-secondary">{t.emergency.stay}</p>
    </main>
  );
}
