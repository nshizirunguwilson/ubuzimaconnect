"use client";

import { staffLogin } from "@ubuzima/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthCard } from "@/components/app/auth-card";
import { PasswordInput } from "@/components/app/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { api, ApiFailure } from "@/lib/api";
import { check } from "@/lib/form";
import { formatTime } from "@/lib/time";
import { usePending, useOnHide } from "@/lib/pending";

type Problem = {
  tone: "urgent" | "warning" | "info" | "success";
  title: string;
  body: string;
  unlock?: boolean;
} | null;

/** FR 2.1 and 2.3: email and password, then a code by email (FR 2.2). */
export function StaffLoginForm({
  ended,
  other = false,
  done,
}: {
  ended: boolean;
  other?: boolean;
  done: "password" | "unlocked" | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = usePending(false);
  const [problem, setProblem] = useState<Problem>(
    other
      ? {
          tone: "info",
          title: "This page is for staff",
          body: "You're logged in to the patient app. Log in with a staff account to continue.",
        }
      : ended
        ? {
            tone: "info",
            title: "You were logged out",
            body: "Your session ended after 15 minutes without activity.",
          }
        : done === "password"
          ? {
              tone: "success",
              title: "Password saved",
              body: "Log in with your new password.",
            }
          : done === "unlocked"
            ? {
                tone: "success",
                title: "Account unlocked",
                body: "Log in with your password.",
              }
            : null,
  );
  // Nothing typed here is kept once the screen is left.
  useOnHide(() => {
    setPassword("");
    setProblem(null);
    setErrors({});
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = check(staffLogin, { email, password });
    if (!r.data) return setErrors(r.errors);
    setErrors({});
    setPending(true);
    try {
      const res = await api<{ email: string }>("/auth/staff/login", r.data);
      sessionStorage.setItem("uc_code_to", res.email);
      router.push("/staff/login/code");
    } catch (err) {
      setPending(false);
      if (!(err instanceof ApiFailure)) throw err;
      const { code, message, until, fields } = err.error;
      if (code === "LOCKED" && until) {
        return setProblem({
          tone: "urgent",
          title: "Account locked for 15 minutes",
          body: `Too many wrong passwords. Try again after ${formatTime(until)}.`,
        });
      }
      if (code === "LOCKED_EMAIL_UNLOCK") {
        return setProblem({
          tone: "urgent",
          title: "Account locked",
          body: "We've emailed you a code to unlock it.",
          unlock: true,
        });
      }
      const left = Number(fields?.attemptsLeft);
      setProblem({
        tone: "urgent",
        title:
          code === "DEACTIVATED"
            ? "Account turned off"
            : "Email or password is wrong",
        body:
          code === "INVALID_CREDENTIALS"
            ? `Check them and try again.${left && left <= 2 ? ` ${left === 1 ? "1 try" : `${left} tries`} left before the account is locked.` : ""}`
            : message,
      });
    }
  }

  return (
    <AuthCard
      title="Staff login"
      intro="For health agents, clinicians, facility managers and administrators."
    >
      {problem && (
        <Notice
          tone={problem.tone}
          title={problem.title}
          action={
            problem.unlock ? (
              <Link
                href="/staff/unlock"
                className="text-small font-semibold underline underline-offset-2"
              >
                Enter the unlock code
              </Link>
            ) : undefined
          }
        >
          {problem.body}
        </Notice>
      )}
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        <Input
          label="Email"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <PasswordInput
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <div className="flex flex-col gap-4 sm:flex-row-reverse sm:items-center sm:justify-between">
          <Button
            type="submit"
            variant="primary"
            loading={pending}
            className="w-full sm:w-auto"
          >
            Continue
          </Button>
          <Link
            href="/staff/reset"
            className="text-center text-small font-medium text-link underline underline-offset-2"
          >
            Forgot your password?
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
