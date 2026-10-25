import Image from "next/image";
import Link from "next/link";

/**
 * The UbuzimaConnect Logo Pack, converted from its .ai files to SVG and cropped to the artwork
 * (docs/design/DECISIONS.md, D68). Sizes are set by height, so every variant lines up with the text next to it.
 *
 * - horizontal: page headers. Prints in the pack's black version.
 * - stacked: the welcome and login pages, where the brand is the first thing seen. Carries the tagline.
 * - compact: headers that share a phone-width row with a button. The symbol under 640 px, the horizontal logo above.
 */
const ART = {
  horizontal: { src: "/brand/logo-horizontal.svg", ratio: 1815 / 203 },
  black: { src: "/brand/logo-horizontal-black.svg", ratio: 1815 / 203 },
  stacked: { src: "/brand/logo-stacked.svg", ratio: 662 / 363 },
  symbol: { src: "/brand/logo-symbol.svg", ratio: 212 / 203 },
} as const;

type Variant = "horizontal" | "stacked" | "compact";

function Art({ art, height, className }: { art: keyof typeof ART; height: number; className?: string }) {
  const { src, ratio } = ART[art];
  return <Image src={src} alt="UbuzimaConnect" width={Math.round(height * ratio)} height={height} className={className} priority />;
}

export function Logo({ href = "/", variant = "horizontal", height }: { href?: string; variant?: Variant; height?: number }) {
  const h = height ?? (variant === "stacked" ? 112 : 28);
  return (
    <Link href={href} className="inline-flex shrink-0" aria-label="UbuzimaConnect home">
      {variant === "stacked" ? (
        <Art art="stacked" height={h} />
      ) : (
        <>
          {variant === "compact" && <Art art="symbol" height={36} className="sm:hidden print:hidden" />}
          <Art art="horizontal" height={h} className={variant === "compact" ? "max-sm:hidden print:hidden" : "print:hidden"} />
          <Art art="black" height={h} className="hidden print:block" />
        </>
      )}
    </Link>
  );
}

/** The black horizontal logo, for printed pages only (FR 7.2 summary). */
export function PrintLogo() {
  return <Art art="black" height={24} className="mb-2" />;
}
