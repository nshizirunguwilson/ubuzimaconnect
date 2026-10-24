/* eslint-disable @next/next/no-img-element -- the photo is served by our API behind the session cookie */
import { cn } from "@/lib/cn";

/** A true circle (DESIGN.md §5): identity photos from NIDA (FR 1.10). */
export function Avatar({ src, name, size = 40, className }: { src: string | null; name: string; size?: number; className?: string }) {
  return src ? (
    <img
      src={src}
      alt={`Photo of ${name}`}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full bg-sunken object-cover object-top", className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-sunken text-small font-semibold text-fg-secondary", className)}
      style={{ width: size, height: size }}
    >
      {name.slice(0, 1)}
    </span>
  );
}
