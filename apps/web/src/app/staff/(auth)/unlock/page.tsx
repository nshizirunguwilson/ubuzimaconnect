"use client";

import { LIMITS, unlockRequest, resetRequest } from "@ubuzima/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthCard } from "@/components/app/auth-card";
import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/ui/code-input";
import { Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { check } from "@/lib/form";
import { usePending, useOnHide } from "@/lib/pending";

/** FR 2.4: after a second lock, only the emailed code (valid 15 minutes) opens the account. */
export default function UnlockPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = usePending(false);
  // Nothing typed here is kept once the screen is left.
  useOnHide(() => {
    setCode("");
    setErrors({});
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = check(unlockRequest, { email, code });
    if (!r.data) return setErrors(r.errors);
    setErrors({});
    setPending(true);
    try {
      await api("/auth/staff/unlock", r.data);
      router.replace("/staff/login?done=unlocked");
    } catch (err) {
      setPending(false);
      if (err instanceof ApiFailure) setErrors({ code: err.error.message });
    }
  }

  async function resend() {
    const r = check(resetRequest, { email });
    if (!r.data) return setErrors(r.errors);
    await api("/auth/staff/unlock/resend", r.data).catch(() => null);
    toast.success("If the account is locked, a new code is on its way");
  }

  return (
    <AuthCard title="Unlock your account" intro={`Enter the code from the email we sent. It works for ${LIMITS.unlockCodeMinutes} minutes.`}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        <Input label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <CodeInput label="Unlock code" value={code} onChange={setCode} error={errors.code} />
        <div className="flex flex-col gap-3 sm:flex-row-reverse sm:justify-between">
          <Button type="submit" variant="primary" loading={pending} className="w-full sm:w-auto">
            Unlock account
          </Button>
          <Button variant="ghost" onClick={resend} className="w-full sm:w-auto">
            Send a new code
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}
