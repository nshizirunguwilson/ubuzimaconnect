import Image from "next/image";
import Link from "next/link";

/** The horizontal logo (UbuzimaConnect Logo Pack, 480 px wide export). */
export function Logo({ href = "/", width = 140 }: { href?: string; width?: number }) {
  return (
    <Link href={href} className="inline-flex shrink-0" aria-label="UbuzimaConnect home">
      <Image src="/brand/logo-horizontal.png" alt="UbuzimaConnect" width={width} height={Math.round(width / 5.84)} priority />
    </Link>
  );
}
