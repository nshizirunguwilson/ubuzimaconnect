import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Demo inbox", robots: { index: false } };

type Email = { id: string; to: string; subject: string; text: string; createdAt: string };

/**
 * D66: the emails sent to the made-up demo accounts (@ubuzima.test): login codes, invitations, reset links.
 * The API decides what may be shown; on the live site it is only the demo addresses, and only when switched on.
 */
export default function DemoInbox() {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-fg">Demo inbox</h1>
        <p className="text-body text-fg-secondary">
          The emails sent to the demo staff accounts (…@ubuzima.test), so you can log in with them. Real staff get real emails, which never appear here. Newest first.
        </p>
      </div>
      <Suspense>
        <List />
      </Suspense>
    </main>
  );
}

async function List() {
  await connection();
  const res = await fetch(`${process.env.API_URL ?? "http://localhost:4000"}/demo/inbox`, { cache: "no-store" });
  if (res.status === 404) notFound();
  const emails: Email[] = res.ok ? await res.json() : [];
  if (emails.length === 0) return <p className="text-body text-fg-secondary">No emails yet.</p>;
  return emails.map((e) => (
    <Card key={e.id} className="flex flex-col gap-2">
      <p className="text-caption text-fg-muted">
        To {e.to} · {formatDateTime(e.createdAt)}
      </p>
      <h2 className="text-h3 text-fg">{e.subject}</h2>
      <pre className="font-sans text-small whitespace-pre-wrap text-fg">{autolink(e.text)}</pre>
    </Card>
  ));
}

function autolink(text: string) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    part.startsWith("http") ? (
      <a key={i} href={part} className="font-medium break-all text-link underline underline-offset-2">
        {part}
      </a>
    ) : (
      part
    ),
  );
}
