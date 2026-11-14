import Image from "next/image";
import Link from "next/link";

/**
 * The UbuzimaConnect Logo Pack, converted from its .ai files to SVG and cropped to the artwork
 * (docs/design/DECISIONS.md, D68). Sizes are set by height, so every variant lines up with the text next to it.
 *
 * - hero: symbol, name and tagline in one line, centred on the pages where the brand is seen first.
 * - header: the name alone, inside the app, where the symbol would only repeat what the page already says.
 * - compact: the symbol alone under 640 px, where a header row also holds a button; the name above.
 * Both header variants print in the pack's black version.
 */
const ART = {
  tagline: { src: "/brand/logo-tagline.svg", ratio: 1168 / 203 },
  wordmark: { src: "/brand/logo-wordmark.svg", ratio: 1101 / 106 },
  black: { src: "/brand/logo-wordmark-black.svg", ratio: 1101 / 106 },
  symbol: { src: "/brand/logo-symbol.svg", ratio: 212 / 203 },
} as const;

type Variant = "hero" | "header" | "compact";

function Art({ art, height, className }: { art: keyof typeof ART; height: number; className?: string }) {
  const { src, ratio } = ART[art];
  return <Image src={src} alt="UbuzimaConnect" width={Math.round(height * ratio)} height={height} className={className} priority />;
}

export function Logo({ href = "/", variant = "header", height }: { href?: string; variant?: Variant; height?: number }) {
  if (variant === "hero") {
    return (
      <Link href={href} className="inline-flex shrink-0 self-center" aria-label="UbuzimaConnect home">
        <Art art="tagline" height={height ?? 56} />
      </Link>
    );
  }
  const h = height ?? 22;
  return (
    <Link href={href} className="inline-flex shrink-0 items-center" aria-label="UbuzimaConnect home">
      {variant === "compact" && <Art art="symbol" height={32} className="sm:hidden print:hidden" />}
      <Art art="wordmark" height={h} className={variant === "compact" ? "max-sm:hidden print:hidden" : "print:hidden"} />
      <Art art="black" height={h} className="hidden print:block" />
    </Link>
  );
}

/** The black name, for printed pages only (FR 7.2 summary). */
export function PrintLogo() {
  return <Art art="black" height={20} className="mb-2" />;
}
