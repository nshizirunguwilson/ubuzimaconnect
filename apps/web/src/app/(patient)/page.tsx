import Link from "next/link";
import { InstallApp } from "@/components/patient/install-app";
import { LuChevronRight, LuPhone } from "react-icons/lu";
import { Logo } from "@/components/app/logo";
import { BottomBar } from "@/components/app/bottom-bar";
import { SquircleLink } from "@/components/ui/squircle-link";
import { ButtonLink } from "@/components/ui/button-link";
import { LanguageSwitch } from "@/i18n/client";
import { getT } from "@/i18n/server";

/** Start page. One primary action (log in), and the emergency number without logging in (FR 1.9). */
export default async function Welcome() {
  const t = await getT();
  return (
    <>
      <header className="flex items-center justify-between gap-3 lg:mx-auto lg:w-full lg:max-w-[480px]">
        <Logo />
        <LanguageSwitch />
      </header>
      <main className="flex flex-1 flex-col gap-8 pt-16 lg:mx-auto lg:w-full lg:max-w-[480px]">
        <div className="flex flex-col gap-3">
          <h1 className="text-display text-fg">{t.welcome.title}</h1>
          <p className="text-body text-fg-secondary">{t.welcome.intro}</p>
        </div>

        <SquircleLink
          href="/emergency"
          radius="md"
          className="flex min-h-16 items-center gap-3 px-4 py-3 sq-bg-urgent-soft text-urgent-fg hover:sq-bg-red-50"
        >
          <LuPhone className="size-6 shrink-0" aria-hidden />
          <span className="flex flex-1 flex-col">
            <span className="text-body font-semibold">{t.common.emergencyCall912}</span>
            <span className="text-small text-fg">{t.welcome.noLogin}</span>
          </span>
          <LuChevronRight className="size-5 shrink-0" aria-hidden />
        </SquircleLink>

        <InstallApp />

        <div className="flex-1" />

        <BottomBar>
          <ButtonLink href="/login" variant="primary" className="w-full">
            {t.welcome.login}
          </ButtonLink>
          <p className="text-center text-small text-fg-secondary">
            {t.welcome.healthWorker}{" "}
            <Link href="/staff/login" className="font-medium text-link underline underline-offset-2">
              {t.welcome.staffLogin}
            </Link>
          </p>
        </BottomBar>
      </main>
    </>
  );
}
