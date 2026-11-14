"use client";

import { periodRange, shiftPeriod, type Period } from "@ubuzima/shared";
import { useState } from "react";
import { PiCaretLeftBold, PiCaretRightBold, PiDownloadSimpleBold } from "react-icons/pi";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Squircle } from "@/components/ui/squircle";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/time";
import { useApi } from "@/lib/use-api";
import { Loading } from "@/components/ui/loading";

type Tile = { label: string; value: number | null; unit?: "min" | "%" | "hours" | "days" | "/5"; hint?: string };
type Report = {
  title: string;
  period: Period;
  start: string;
  end: string;
  tiles: Tile[];
  tables: { title: string; columns: string[]; rows: (string | number | null)[][] }[];
};

const today = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
const LABEL: Record<Period, string> = { day: "Day", week: "Week", month: "Month" };

/** "24 Oct 2026", "19 to 25 Oct 2026", "October 2026". */
function periodName(period: Period, anchor: string) {
  const range = periodRange(period, anchor);
  if (period === "day") return formatDate(range.start);
  if (period === "month")
    return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${range.start}T00:00:00Z`),
    );
  const last = range.days[range.days.length - 1];
  return `${formatDate(range.start).replace(/ \d{4}$/, "")} to ${formatDate(last)}`;
}

/** Stat tile (dataviz contract): label, then the value in proportional figures; a dash when the period has no data. */
function value(tile: Tile) {
  if (tile.value === null) return "-";
  const formatted = tile.value.toLocaleString("en-GB");
  if (tile.unit === "%") return `${formatted}%`;
  if (tile.unit === "/5") return `${formatted} / 5`;
  if (tile.unit) return `${formatted} ${tile.unit}`;
  return formatted;
}

/**
 * Each role's own report for a day, a week or a month, with the same numbers as a CSV download.
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
          {(["day", "week", "month"] as const).map((option) => (
            <Squircle
              key={option}
              as="button"
              type="button"
              role="radio"
              aria-checked={period === option}
              radius="md"
              focus="self"
              onClick={() => setPeriod(option)}
              className={cn(
                "h-10 cursor-pointer px-3.5 text-small font-medium",
                period === option
                  ? "sq-bg-accent-soft sq-border-primary text-info-fg"
                  : "sq-bg-surface sq-border-border-strong text-fg hover:sq-bg-sunken",
              )}
            >
              {LABEL[option]}
            </Squircle>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Previous ${period}`}
            onClick={() => setAnchor(shiftPeriod(period, anchor, -1))}
          >
            <PiCaretLeftBold />
          </Button>
          <span className="min-w-36 text-center text-small font-medium text-fg">{periodName(period, anchor)}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Next ${period}`}
            disabled={isCurrent}
            onClick={() => setAnchor(shiftPeriod(period, anchor, 1))}
          >
            <PiCaretRightBold />
          </Button>
        </div>
        <a
          href={`/api/reports/csv?period=${period}&date=${anchor}`}
          className="ml-auto inline-flex min-h-10 items-center gap-2 text-small font-medium text-link underline underline-offset-2"
        >
          <PiDownloadSimpleBold className="size-4" aria-hidden />
          Download CSV
        </a>
      </div>

      {error ? (
        <p className="text-small font-medium text-urgent-fg">{error}</p>
      ) : !data ? (
        <Loading className="h-64" />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {data.tiles.map((tile) => (
              <Card key={tile.label} className="flex flex-col gap-1">
                <dt className="text-small text-fg-secondary">{tile.label}</dt>
                <dd className="font-heading text-h2 font-semibold text-fg">{value(tile)}</dd>
                {tile.hint && <dd className="text-caption text-fg-muted">{tile.hint}</dd>}
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
                        {tb.columns.map((column, index) => (
                          <th key={index} className={cn("py-2 pr-3 font-medium", index > 0 && "text-right")}>
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {tb.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((value, index) => (
                            <td
                              key={index}
                              className={cn("py-2 pr-3", index === 0 ? "text-fg" : "text-right text-fg tabular-nums")}
                            >
                              {value ?? "-"}
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
          <p className="text-caption text-fg-muted">
            A dash means there was nothing to measure in this period. Times are in Rwanda time.
          </p>
        </>
      )}
    </div>
  );
}
