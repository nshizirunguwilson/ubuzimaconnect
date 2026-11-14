import { PiCircleNotchBold } from "react-icons/pi";

/**
 * Shown while a screen's data is on its way, so a slow connection doesn't look like an empty or broken page.
 * It appears after a short delay, so fast loads don't flash it.
 */
export function Loading({ className = "h-48", label = "Loading" }: { className?: string; label?: string }) {
  return (
    <div className={`flex items-start justify-center pt-16 ${className}`} role="status" aria-busy>
      <span className="flex animate-[fade_0.2s_ease-out_0.3s_both] items-center gap-2 text-small text-fg-secondary">
        <PiCircleNotchBold className="size-5 animate-spin" aria-hidden />
        {label}
      </span>
    </div>
  );
}
