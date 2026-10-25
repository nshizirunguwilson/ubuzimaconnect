import { Logo } from "@/components/app/logo";
import { LogoutButton } from "@/components/app/logout-button";
import { LanguageSwitch } from "@/i18n/client";

/** On computers only: the logo and Log out above logged-in patient pages. Phones keep the single back link. */
export function DesktopHeader() {
  return (
    <header className="mb-8 hidden items-center justify-between gap-4 border-b border-border pb-4 lg:flex">
      <Logo href="/home" height={30} />
      <div className="flex items-center gap-3">
        <LanguageSwitch />
        <LogoutButton to="/" />
      </div>
    </header>
  );
}
