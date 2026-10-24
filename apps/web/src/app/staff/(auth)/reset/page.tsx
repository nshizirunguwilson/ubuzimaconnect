"use client";

import { LIMITS, resetRequest } from "@ubuzima/shared";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthCard } from "@/components/app/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { api } from "@/lib/api";
import { check } from "@/lib/form";

/** FR 2.7: ask for a reset link. The answer is the same whether or not the email has an account. */
export default function ResetRequestPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = check(resetRequest, { email });
    if (!r.data) return setError(r.errors.email);
    setError(undefined);
    setPending(true);
    await api("/auth/staff/reset", r.data).catch(() => null);
    setPending(false);
    setSent(true);
  }

  if (sent) {
    return (
      <AuthCard title="Check your email">
        <Notice tone="success" title="Link sent">
          If {email} has a staff account, we&apos;ve sent a link to reset the password. It works for {LIMITS.resetLinkMinutes}{" "}
          minutes.
        </Notice>
        <Link href="/staff/login" className="text-small font-medium text-link underline underline-offset-2">
          Back to staff login
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset your password" intro="We'll email you a link to choose a new one.">
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        <Input label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
        <div className="flex flex-col gap-4 sm:flex-row-reverse sm:items-center sm:justify-between">
          <Button type="submit" variant="primary" loading={pending} className="w-full sm:w-auto">
            Send link
          </Button>
          <Link href="/staff/login" className="text-center text-small font-medium text-link underline underline-offset-2">
            Back to staff login
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
