"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import {
  LuActivity,
  LuArrowRight,
  LuCircleCheck,
  LuCircleHelp,
  LuIdCard,
  LuInbox,
  LuSend,
  LuTriangleAlert,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, ChoiceRow, Radio } from "@/components/ui/choice";
import { CodeDisplay } from "@/components/ui/code-display";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select, Textarea } from "@/components/ui/field";
import { QueueRow } from "@/components/ui/queue-row";
import { RADIUS, Squircle, useSquircleMode, type Radius } from "@/components/ui/squircle";
import { StatusBadge, TriageBadge } from "@/components/ui/status";
import { StepProgress } from "@/components/ui/step-progress";
import { Tab, Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { contrast } from "@/lib/contrast";
import { palette, pairs } from "@/lib/tokens";

/**
 * The Stage 2 component sheet: every building block from DESIGN.md §9 with real
 * UbuzimaConnect content, for review before any screen is built.
 */
export function ComponentSheet() {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-16 px-4 py-8 md:px-8 md:py-12">
      <Header />
      <Colour />
      <Typography />
      <Shape />
      <Buttons />
      <Fields />
      <Choices />
      <Statuses />
      <Queue />
      <Flow />
      <Overlays />
    </div>
  );
}

function Section({ title, source, children }: { title: string; source: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 border-b border-border pb-3">
        <h2 className="text-h2 text-fg">{title}</h2>
        <p className="text-small text-fg-secondary">{source}</p>
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="text-caption text-fg-muted">{children}</p>;
}

function Header() {
  const mode = useSquircleMode();
  return (
    <header className="flex flex-col gap-6">
      <Image src="/brand/logo-horizontal.svg" alt="UbuzimaConnect" width={250} height={28} priority />
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-fg">Component sheet</h1>
        <p className="max-w-[70ch] text-body text-fg-secondary">
          Every building block in DESIGN.md, with real content. Screens may only be built from these parts.
        </p>
      </div>
      <p className="flex flex-wrap items-center gap-2 text-small text-fg-secondary">
        Squircles in this browser:
        <StatusBadge tone="neutral">{mode === "native" ? "Native corner-shape" : mode === "fallback" ? "SVG fallback" : "…"}</StatusBadge>
        <a className="font-medium text-link underline underline-offset-2" href={mode === "fallback" ? "?" : "?sq=fallback"}>
          {mode === "fallback" ? "Show native" : "Show fallback"}
        </a>
      </p>
    </header>
  );
}

/* ---------- Colour ---------- */

const roles: { group: string; share: string; items: [string, keyof typeof palette][] }[] = [
  {
    group: "Surfaces",
    share: "60%",
    items: [
      ["Page", "gray-50"],
      ["Surface", "white"],
      ["Sunken", "gray-100"],
    ],
  },
  {
    group: "Text and structure",
    share: "30%",
    items: [
      ["Text", "gray-900"],
      ["Secondary", "gray-600"],
      ["Muted", "gray-500"],
      ["Border", "gray-200"],
      ["Input border", "gray-400"],
    ],
  },
  {
    group: "Accent",
    share: "10%",
    items: [
      ["Primary", "blue-600"],
      ["Link", "blue-700"],
      ["Highlight", "blue-50"],
      ["Brand", "blue-500"],
    ],
  },
  {
    group: "Status, only with an icon and a label",
    share: "",
    items: [
      ["Urgent", "red-600"],
      ["Warning", "amber-400"],
      ["Success", "green-600"],
    ],
  },
];

function Colour() {
  return (
    <Section title="Colour" source="DESIGN.md §2 · 60-30-10, NHS colour rules (RESEARCH §2.2)">
      <div className="grid gap-8 md:grid-cols-2">
        {roles.map(({ group, share, items }) => (
          <div key={group} className="flex flex-col gap-3">
            <p className="text-small font-medium text-fg">
              {group}
              {share && <span className="font-normal text-fg-muted"> · {share}</span>}
            </p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {items.map(([name, shade]) => (
                <div key={name} className="flex flex-col gap-1.5">
                  <Squircle radius="sm" className="h-12 sq-border-border" style={{ ["--sq-bg" as string]: palette[shade] }} />
                  <span className="text-caption text-fg">{name}</span>
                  <span className="font-mono text-caption text-fg-muted">{palette[shade]}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <details className="group">
        <summary className="cursor-pointer text-small font-medium text-link">
          Contrast of every pair we use ({pairs.length}, all pass)
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-small">
            <thead className="text-caption text-fg-muted">
              <tr className="border-b border-border">
                <th className="py-2 font-medium">Pair</th>
                <th className="py-2 font-medium">Sample</th>
                <th className="py-2 text-right font-medium">Ratio</th>
                <th className="py-2 text-right font-medium">Needs</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map(([what, fg, bg, min]) => (
                <tr key={what} className="border-b border-border">
                  <td className="py-2 text-fg">{what}</td>
                  <td className="py-2">
                    <span className="px-2 py-1 font-medium" style={{ color: palette[fg], background: palette[bg] }}>
                      Aa
                    </span>
                  </td>
                  <td className="py-2 text-right text-fg tabular-nums">{contrast(palette[fg], palette[bg]).toFixed(2)}</td>
                  <td className="py-2 text-right text-fg-secondary tabular-nums">{min}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Section>
  );
}

/* ---------- Type ---------- */

const typeScale = [
  ["Display · Outfit 32/40", "text-display font-heading font-semibold", "Call 912 now"],
  ["H1 · Outfit 24/32", "text-h1 font-heading font-semibold", "Your case"],
  ["H2 · Outfit 20/28", "text-h2 font-heading font-semibold", "Incoming patients"],
  ["H3 · Outfit 16/24", "text-h3 font-heading font-semibold", "Kacyiru District Hospital"],
  ["Body · Google Sans Flex 16/24", "text-body", "An agent will reply in a few minutes. You can close the app; we will notify you."],
  ["Body small · 14/20", "text-small", "Waiting since 10:42 · Gasabo, Kigali"],
  ["Label · 14/20 medium", "text-small font-medium", "Date of birth"],
  ["Caption · 12/16 medium", "text-caption font-medium", "24 Oct 2026, 10:42"],
  ["Code · Google Sans Code 16/24", "font-mono text-body font-medium tracking-wider", "RX-7K3M-9P2Q"],
] as const;

function Typography() {
  return (
    <Section title="Typography" source="DESIGN.md §3 · sentence case, 12 px minimum, 70 characters per line">
      <div className="flex flex-col divide-y divide-border">
        {typeScale.map(([label, cls, sample]) => (
          <div key={label} className="grid gap-1 py-4 md:grid-cols-[240px_1fr] md:gap-6">
            <Label>{label}</Label>
            <p className={`${cls} max-w-[70ch] text-fg`}>{sample}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ---------- Shape ---------- */

const shapeUse: Record<Radius, string> = {
  xs: "Checkbox",
  sm: "Badges, chips",
  md: "Inputs, buttons, rows",
  lg: "Cards",
  xl: "Dialogs, sheets",
};

function Shape() {
  return (
    <Section title="Shape" source="DESIGN.md §5 · every rounded shape is a squircle; only true circles stay round">
      <div className="flex flex-wrap items-end gap-6">
        {(Object.keys(RADIUS) as Radius[]).map((r) => {
          const size = { xs: 20, sm: 40, md: 64, lg: 96, xl: 128 }[r];
          return (
            <div key={r} className="flex flex-col gap-2">
              <Squircle radius={r} className="sq-bg-accent-soft sq-border-blue-200" style={{ width: size, height: size }} />
              <span className="text-caption font-medium text-fg">
                {r} · {RADIUS[r]} px
              </span>
              <span className="text-caption text-fg-muted">{shapeUse[r]}</span>
            </div>
          );
        })}
        <div className="flex flex-col gap-2">
          <span className="size-10 rounded-full border border-border-strong bg-surface" />
          <span className="text-caption font-medium text-fg">Circle</span>
          <span className="text-caption text-fg-muted">Radio, avatar</span>
        </div>
      </div>
    </Section>
  );
}

/* ---------- Buttons ---------- */

function Buttons() {
  return (
    <Section title="Buttons" source="DESIGN.md §9 · one primary per screen; 48 px on phones, 40 px on desktop">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" icon={<LuSend />}>
          Submit case
        </Button>
        <Button variant="secondary">Save for later</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="danger">Close case</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" loading>
          Submitting
        </Button>
        <Button variant="primary" disabled>
          Submit case
        </Button>
        <Button variant="secondary" size="icon" aria-label="Next">
          <LuArrowRight />
        </Button>
      </div>
    </Section>
  );
}

/* ---------- Fields ---------- */

const districts = ["Gasabo", "Kicukiro", "Nyarugenge"].map((d) => ({ value: d.toLowerCase(), label: d }));

function Fields() {
  return (
    <Section title="Form fields" source="DESIGN.md §9 · label above, hint below, errors say what to do next">
      <div className="grid max-w-[720px] gap-6 md:grid-cols-2">
        <Input label="National ID" inputMode="numeric" mono leading={<LuIdCard />} hint="16 digits, on the front of your ID card" placeholder="1 1990 8 0012345 0 12" />
        <Input
          label="Date of birth"
          type="date"
          defaultValue="1990-05-14"
          error="That ID doesn't match. Check the date of birth and try again."
        />
        <Select label="District" placeholder="Choose a district" options={districts} />
        <Input label="Phone number" type="tel" optional hint="We only use it if the app can't reach you" />
        <Textarea
          className="md:col-span-2"
          label="What is wrong?"
          hint="In your own words. Kinyarwanda or English."
          placeholder="My child has had a fever since yesterday"
        />
        <Input label="Email code" disabled defaultValue="482 913" mono />
      </div>
    </Section>
  );
}

/* ---------- Choices ---------- */

function Choices() {
  return (
    <Section title="Choices" source="DESIGN.md §9 · choice rows from RESEARCH R1; 44 px targets">
      <div className="grid gap-10 md:grid-cols-2">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-h3 font-heading font-semibold text-fg">Is the person having trouble breathing?</legend>
          <ChoiceRow name="breathing" value="yes" label="Yes" />
          <ChoiceRow name="breathing" value="no" label="No" defaultChecked />
          <ChoiceRow name="breathing" value="unsure" label="I'm not sure" />
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-h3 font-heading font-semibold text-fg">Confirm the triage level</legend>
          <ChoiceRow
            name="level"
            value="urgent"
            icon={<LuTriangleAlert className="text-urgent" />}
            label="Urgent"
            description="Needs care today. Route to the nearest hospital."
          />
          <ChoiceRow
            name="level"
            value="uncertain"
            icon={<LuCircleHelp className="text-warning-fg" />}
            label="Uncertain"
            description="Ask a clinician before routing."
            defaultChecked
          />
          <ChoiceRow
            name="level"
            value="minor"
            icon={<LuCircleCheck className="text-success" />}
            label="Minor"
            description="Advice and a health centre visit if it gets worse."
          />
        </fieldset>
        <div className="flex flex-col">
          <p className="mb-2 text-small font-medium text-fg">Symptoms (checkbox)</p>
          <Checkbox label="Fever" defaultChecked />
          <Checkbox label="Cough" />
          <Checkbox label="Vomiting" disabled />
        </div>
        <div className="flex flex-col">
          <p className="mb-2 text-small font-medium text-fg">Who is sick? (radio)</p>
          <Radio name="who" label="Me" defaultChecked />
          <Radio name="who" label="Someone else" />
        </div>
      </div>
    </Section>
  );
}

/* ---------- Status ---------- */

function Statuses() {
  return (
    <Section title="Status" source="DESIGN.md §2 · icon + label + tint, never colour alone (NHS)">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <TriageBadge level="urgent" />
          <TriageBadge level="uncertain" />
          <TriageBadge level="minor" />
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="info">With an agent</StatusBadge>
          <StatusBadge tone="success">Dispensed</StatusBadge>
          <StatusBadge tone="neutral">Closed</StatusBadge>
        </div>
      </div>
    </Section>
  );
}

/* ---------- Queue ---------- */

const queue = {
  urgent: [
    { id: "UC-20261024-0042", meta: "Breathing problem · Gasabo", time: "4 min", label: "Waiting 4 minutes" },
    { id: "UC-20261024-0039", meta: "Chest pain · Kicukiro", time: "9 min", label: "Waiting 9 minutes" },
  ],
  uncertain: [
    { id: "UC-20261024-0041", meta: "Fever, child · Nyarugenge", time: "6 min", label: "Waiting 6 minutes" },
  ],
  minor: [] as { id: string; meta: string; time: string; label: string }[],
};

function Queue() {
  const [selected, setSelected] = useState(queue.urgent[0].id);
  return (
    <Section title="Tabs and queue rows" source="DESIGN.md §9 · RESEARCH R2 (tabs with counts, time on the right) and R3">
      <Card className="max-w-[720px] p-0 md:p-0">
        <Tabs defaultValue="urgent">
          <TabsList className="px-4 md:px-6">
            <Tab value="urgent" count={queue.urgent.length}>Urgent</Tab>
            <Tab value="uncertain" count={queue.uncertain.length}>Uncertain</Tab>
            <Tab value="minor" count={0}>Minor</Tab>
          </TabsList>
          {(["urgent", "uncertain", "minor"] as const).map((level) => (
            <TabsContent key={level} value={level} className="flex flex-col gap-1 p-2 outline-none" aria-live="polite">
              {queue[level].length === 0 ? (
                <EmptyState icon={LuInbox} message="No minor cases waiting." />
              ) : (
                queue[level].map((c) => (
                  <QueueRow
                    key={c.id}
                    title={c.id}
                    meta={c.meta}
                    status={<TriageBadge level={level} />}
                    time={c.time}
                    timeLabel={c.label}
                    selected={selected === c.id}
                    onClick={() => setSelected(c.id)}
                  />
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      </Card>
    </Section>
  );
}

/* ---------- Flow ---------- */

function Flow() {
  return (
    <Section title="Progress, codes and cards" source="DESIGN.md §9 · RESEARCH R1 (segmented progress) and R4 (one highlighted card)">
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col gap-6">
          <StepProgress current={2} total={5} label="Symptoms" />
          <CodeDisplay label="Prescription code" value="RX-7K3M-9P2Q" />
        </Card>
        <div className="flex flex-col gap-4">
          <Card highlighted className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-h3 text-fg">Your case</h3>
              <StatusBadge tone="info">With an agent</StatusBadge>
            </div>
            <p className="text-body text-fg">An agent is reviewing your answers. You will get a reply here.</p>
            <p className="font-mono text-small font-medium text-fg-secondary">UC-20261024-0042</p>
          </Card>
          <Card className="flex items-start gap-3">
            <LuActivity className="mt-0.5 size-5 shrink-0 text-fg-secondary" aria-hidden />
            <div className="flex flex-col gap-1">
              <h3 className="text-h3 text-fg">Kacyiru District Hospital</h3>
              <p className="text-small text-fg-secondary">Gasabo · 2.1 km · open 24 hours</p>
            </div>
          </Card>
        </div>
      </div>
    </Section>
  );
}

/* ---------- Overlays ---------- */

function Overlays() {
  return (
    <Section title="Dialog, toast and empty state" source="DESIGN.md §9 · a bottom sheet on phones, a dialog on desktop">
      <div className="flex flex-wrap gap-3">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Open dialog</Button>
          </DialogTrigger>
          <DialogContent
            title="Close this case?"
            description="The patient will be told the case is closed. You can't reopen it."
            actions={
              <>
                <DialogClose asChild>
                  <Button variant="secondary">Keep open</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="danger" onClick={() => toast.success("Case closed")}>
                    Close case
                  </Button>
                </DialogClose>
              </>
            }
          />
        </Dialog>
        <Button variant="secondary" onClick={() => toast.success("Case submitted")}>
          Show success toast
        </Button>
        <Button variant="secondary" onClick={() => toast.error("Couldn't send. Check your connection and try again.")}>
          Show error toast
        </Button>
      </div>
      <Card className="max-w-[720px]">
        <EmptyState icon={LuInbox} message="No incoming patients right now. New cases appear here." />
      </Card>
    </Section>
  );
}
