import type { Citizen } from "./citizens";

/**
 * FR 1.10: an identity photo. The mock has no real photos, so it returns a plain
 * silhouette; the shape and tone vary only so two people are not identical.
 */
export function photoSvg(c: Citizen): string {
  const tones = ["#CAD4DC", "#A7B4BF", "#E3E9EE", "#D4E9FF"];
  const n = parseInt(c.ref.replace(/\D/g, ""), 10) || 0;
  const bg = tones[n % tones.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="120" height="150" role="img" aria-label="Mock identity photo">
<rect width="120" height="150" fill="${bg}"/>
<circle cx="60" cy="58" r="26" fill="#7E8E9B"/>
<path d="M14 150c4-32 22-48 46-48s42 16 46 48z" fill="#7E8E9B"/>
</svg>`;
}
