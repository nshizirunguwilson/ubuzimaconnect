"use client";

import { emailCode, LIMITS } from "@ubuzima/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { AuthCard } from "@/components/app/auth-card";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { Notice } from "@/components/ui/notice";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { check } from "@/lib/form";
import { usePending, useOnHide } from "@/lib/pending";

const noop = () => () => {};

/** FR 2.2: the second factor, a 6-digit code by email that works for 5 minutes. */
export function CodeForm() {
  const router = useRouter();
  const to = useSyncExternalStore(noop, () => sessionStorage.getItem("uc_code_to"), () => null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = usePending(false);
  // Nothing typed here is kept once the screen is left.
  useOnHide(() => {
    setCode("");
    setError(undefined);
  });
  const [sending, setSending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = check(emailCode, { code });
    if (!r.data) return setError(r.errors.code);
    setError(undefined);
    setPending(true);
    try {
      await api("/auth/staff/code", r.data);
      sessionStorage.removeItem("uc_code_to");
      router.replace("/staff");
    } catch (err) {
      setPending(false);
      if (!(err instanceof ApiFailure)) throw err;
      if (err.error.code === "UNAUTHENTICATED") return setExpired(true);
      setError(err.error.message);
    }
  }

  async function resend() {
    setSending(true);
    try {
      await api("/auth/staff/code/resend", {});
      setCode("");
      setError(undefined);
      toast.success("New code sent");
    } catch (err) {
      if (err instanceof ApiFailure && err.error.code === "UNAUTHENTICATED") setExpired(true);
      else toast.error("Couldn't send a new code. Try again.");
    } finally {
      setSending(false);
    }
  }

  if (expired) {
    return (
      <AuthCard title="This login has timed out">
        <Notice tone="info" title="Start again">
          The code only works for {LIMITS.loginCodeMinutes} minutes. Enter your email and password again to get a new one.
        </Notice>
        <Link href="/staff/login" className="text-small font-medium text-link underline underline-offset-2">
          Back to staff login
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Check your email"
      intro={
        <>
          We sent a 6-digit code to {to ? <span className="font-medium text-fg">{to}</span> : "your email"}. It works for{" "}
          {LIMITS.loginCodeMinutes} minutes.
        </>
      }
    >
      {/* D66: the made-up demo accounts can't receive mail; their codes are in the demo inbox. */}
      {to?.endsWith("@ubuzima.test") && (
        <Notice tone="info" title="This is a demo account">
          <a href="/demo/inbox" target="_blank" className="font-medium underline underline-offset-2">
            Open the demo inbox
          </a>{" "}
          to read the code.
        </Notice>
      )}
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        <CodeInput label="Code" autoFocus value={code} onChange={setCode} error={error} />
        <div className="flex flex-col gap-3 sm:flex-row-reverse sm:justify-between">
          <Button type="submit" variant="primary" loading={pending} className="w-full sm:w-auto">
            Log in
          </Button>
          <Button variant="ghost" onClick={resend} loading={sending} className="w-full sm:w-auto">
            Send a new code
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
