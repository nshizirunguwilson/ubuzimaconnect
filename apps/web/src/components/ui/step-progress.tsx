import { cn } from "@/lib/cn";

/**
 * Segmented progress with "Step 2 of 5" (DESIGN.md §9, RESEARCH R1).
 * Segments are fully rounded bars, so they are true pills, not squircles.
 */
export function StepProgress({
  current,
  total,
  label,
  noun = "Step",
  text,
  className,
}: {
  /** 1-based. */
  current: number;
  total: number;
  /** The current step's name, e.g. "Symptoms". */
  label?: string;
  /** What is being counted: "Step 2 of 5" or "Question 3 of 18". */
  noun?: string;
  /** The whole line in another language, e.g. "Intambwe ya 2 kuri 5" (NFR 7); replaces noun. */
  text?: string;
  className?: string;
}) {
  const line = text ?? `${noun} ${current} of ${total}`;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="flex justify-between text-small text-fg-secondary">
        <span>{line}</span>
        {label && <span className="font-medium text-fg">{label}</span>}
      </p>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={`${line}${label ? `: ${label}` : ""}`}
        className="flex gap-1"
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-200",
              i < current ? "bg-primary" : "bg-gray-200",
            )}
          />
        ))}
      </div>
    </div>
  );
}
