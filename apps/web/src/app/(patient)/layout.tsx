import { Suspense } from "react";
import { LangProvider } from "@/i18n/client";
import { getLang } from "@/i18n/server";

/**
 * The patient app is phone first: one column. From 1024 px the frame widens; forms and
 * questions stay in one readable column, and the home and case pages use two.
 * Everything inside is in the patient's language, read from the cookie on the server.
 */
export default function PatientLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-4 pt-6 pb-8 lg:max-w-[1040px] lg:px-8">
      <Suspense>
        <WithLang>{children}</WithLang>
      </Suspense>
    </div>
  );
}

async function WithLang({ children }: { children: React.ReactNode }) {
  return <LangProvider lang={await getLang()}>{children}</LangProvider>;
}
