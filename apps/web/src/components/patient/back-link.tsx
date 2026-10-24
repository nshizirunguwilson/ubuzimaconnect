"use client";

import Link from "next/link";
import { useT } from "@/i18n/client";
import { LuArrowLeft } from "react-icons/lu";

/** "Back" in the patient's language unless a label is given (NFR 7). */
export function BackLink({ href, label }: { href: string; label?: string }) {
  const { t } = useT();
  return (
    <Link href={href} className="-ml-2 inline-flex min-h-11 w-fit items-center gap-2 px-2 text-small font-medium text-fg">
      <LuArrowLeft className="size-5" aria-hidden />
      {label ?? t.common.back}
    </Link>
  );
}

export function BackButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const { t } = useT();
  return (
    <button type="button" onClick={onClick} className="-ml-2 inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 px-2 text-small font-medium text-fg">
      <LuArrowLeft className="size-5" aria-hidden />
      {label ?? t.common.back}
    </button>
  );
}
