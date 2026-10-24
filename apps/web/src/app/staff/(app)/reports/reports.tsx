"use client";

import { periodRange, shiftPeriod, type Period } from "@ubuzima/shared";
import { useState } from "react";
import { LuChevronLeft, LuChevronRight, LuDownload } from "react-icons/lu";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Squircle } from "@/components/ui/squircle";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/time";
import { useApi } from "@/lib/use-api";

type Tile = { label: string; value: number | null; unit?: "min" | "%" | "days" | "/5"; hint?: string };
type Report = { title: string; period: Period; start: string; end: string; tiles: Tile[]; tables: { title: string; columns: string[]; rows: (string | number | null)[][] }[] };

const today = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
const LABEL: Record<Period, string> = { day: "Day", week: "Week", month: "Month" };

/** "24 Oct 2026", "19 to 25 Oct 2026", "October 2026". */
function periodName(period: Period, anchor: string) {
  const r = periodRange(period, anchor);
  if (period === "day") return formatDate(r.start);
  if (period === "month") return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${r.start}T00:00:00Z`));
  const last = r.days[r.days.length - 1];
  return `${formatDate(r.start).replace(/ \d{4}$/, "")} to ${formatDate(last)}`;
}

/** Stat tile (dataviz contract): label, then the value in proportional figures; a dash when the period has no data. */
function value(t: Tile) {
  if (t.value === null) return "–";
  const n = t.value.toLocaleString("en-GB");
  return t.unit === "%" ? `${n}%` : t.unit === "/5" ? `${n} / 5` : t.unit ? `${n} ${t.unit}` : n;
}

/**
 * FR 12.8: each role's own report for a day, a week or a month, with the same numbers as a CSV download.
 * Headline numbers first, then the tables behind them.
 */
export function Reports() {
  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState(today);
  const { data, error } = useApi<Report>(`/reports?period=${period}&date=${anchor}`);
  const isCurrent = periodRange(period, today()).start === periodRange(period, anchor).start;

  return (
    <div className="flex max-w-[1000px] flex-col gap-6">
      <PageHeader title="Reports" intro={data ? `${data.title}, ${periodName(period, anchor)}.` : "Loading…"} />

      {/* Filters in one row above the numbers (dataviz: interaction) */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Period" className="flex gap-1">
          {(["day", "week", "month"] as const).map((p) => (
            <Squircle
              key={p}
              as="button"
              type="button"
              role="radio"
              aria-checked={period === p}
              radius="md"
              focus="self"
              onClick={() => setPeriod(p)}
              className={cn("h-10 cursor-pointer px-3.5 text-small font-medium", period === p ? "sq-bg-accent-soft sq-border-primary text-info-fg" : "sq-bg-surface sq-border-border-strong text-fg hover:sq-bg-sunken")}
            >
              {LABEL[p]}
            </Squircle>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={`Previous ${period}`} onClick={() => setAnchor(shiftPeriod(period, anchor, -1))}>
            <LuChevronLeft />
          </Button>
          <span className="min-w-36 text-center text-small font-medium text-fg">{periodName(period, anchor)}</span>
          <Button variant="ghost" size="icon" aria-label={`Next ${period}`} disabled={isCurrent} onClick={() => setAnchor(shiftPeriod(period, anchor, 1))}>
            <LuChevronRight />
          </Button>
        </div>
        <a
          href={`/api/reports/csv?period=${period}&date=${anchor}`}
          className="ml-auto inline-flex min-h-10 items-center gap-2 text-small font-medium text-link underline underline-offset-2"
        >
          <LuDownload className="size-4" aria-hidden />
          Download CSV
        </a>
      </div>

      {error ? (
        <p className="text-small font-medium text-urgent-fg">{error}</p>
      ) : !data ? (
        <div className="h-64" aria-busy />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {data.tiles.map((t) => (
              <Card key={t.label} className="flex flex-col gap-1">
                <dt className="text-small text-fg-secondary">{t.label}</dt>
                <dd className="font-heading text-h2 font-semibold text-fg">{value(t)}</dd>
                {t.hint && <dd className="text-caption text-fg-muted">{t.hint}</dd>}
              </Card>
            ))}
          </dl>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            {data.tables.map((tb) => (
              <Card key={tb.title} className="flex flex-col gap-3 overflow-x-auto">
                <h2 className="text-h3 text-fg">{tb.title}</h2>
                {tb.rows.length === 0 ? (
                  <p className="text-small text-fg-secondary">Nothing in this period.</p>
                ) : (
                  <table className="w-full text-left text-small">
                    <thead className="text-fg-secondary">
                      <tr className="border-b border-border">
                        {tb.columns.map((c, i) => (
                          <th key={i} className={cn("py-2 pr-3 font-medium", i > 0 && "text-right")}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {tb.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((v, j) => (
                            <td key={j} className={cn("py-2 pr-3", j === 0 ? "text-fg" : "text-right text-fg tabular-nums")}>
                              {v ?? "–"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            ))}
          </div>
          <p className="text-caption text-fg-muted">A dash means there was nothing to measure in this period. Times are in Rwanda time.</p>
        </>
      )}
    </div>
  );
}
