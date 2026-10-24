"use client";

import { greetingName, setPassword } from "@ubuzima/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AuthCard } from "@/components/app/auth-card";
import { PasswordInput } from "@/components/app/password-input";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { api, ApiFailure } from "@/lib/api";
import { check } from "@/lib/form";
import { usePending, useOnHide } from "@/lib/pending";

type Link = { purpose: "INVITATION" | "PASSWORD_RESET"; name: string; email: string };

/** FR 2.6 (first password from an invitation) and FR 2.7 (new password from a reset link). */
export function SetPassword({ token, purpose }: { token: string; purpose: Link["purpose"] }) {
  const router = useRouter();
  const [link, setLink] = useState<Link | "invalid" | null>(null);
  const [password, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = usePending(false);
  // Nothing typed here is kept once the screen is left.
  useOnHide(() => {
    setPw("");
    setConfirm("");
    setErrors({});
  });

  useEffect(() => {
    api<Link>(`/auth/staff/links/${encodeURIComponent(token)}`)
      .then((l) => setLink(l.purpose === purpose ? l : "invalid"))
      .catch(() => setLink("invalid"));
  }, [token, purpose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = check(setPassword, { token, password });
    if (!r.data) return setErrors(r.errors);
    if (confirm !== password) return setErrors({ confirm: "The two passwords don't match" });
    setErrors({});
    setPending(true);
    try {
      await api("/auth/staff/password", r.data);
      router.replace("/staff/login?done=password");
    } catch (err) {
      setPending(false);
      if (err instanceof ApiFailure && err.error.code === "TOKEN_INVALID") return setLink("invalid");
      if (err instanceof ApiFailure) setErrors({ password: err.error.message });
    }
  }

  if (link === null) return <AuthCard title={purpose === "INVITATION" ? "Set your password" : "Choose a new password"}>{null}</AuthCard>;

  if (link === "invalid") {
    return (
      <AuthCard title="This link doesn't work">
        <Notice tone="warning" title="Expired or already used">
          {purpose === "INVITATION"
            ? "Invitation links work for 48 hours and only once. Ask your administrator to invite you again."
            : "Reset links work for 30 minutes and only once. Ask for a new one."}
        </Notice>
        <Link href={purpose === "INVITATION" ? "/staff/login" : "/staff/reset"} className="text-small font-medium text-link underline underline-offset-2">
          {purpose === "INVITATION" ? "Back to staff login" : "Get a new link"}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={purpose === "INVITATION" ? `Welcome, ${greetingName(link.name)}` : "Choose a new password"}
      intro={
        <>
          {purpose === "INVITATION" ? "Set a password for " : "For "}
          <span className="font-medium text-fg">{link.email}</span>.
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        <input type="email" autoComplete="username" value={link.email} readOnly hidden />
        <PasswordInput
          label="New password"
          hint="At least 8 characters. A short sentence is easy to remember."
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPw(e.target.value)}
          error={errors.password}
        />
        <PasswordInput
          label="Type it again"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
        <Button type="submit" variant="primary" loading={pending} className="w-full sm:w-auto sm:self-end">
          Save password
        </Button>
      </form>
    </AuthCard>
  );
}
