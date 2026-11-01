import type { Citizen } from "./citizens";

const BACKGROUND_TONES = ["#CAD4DC", "#A7B4BF", "#E3E9EE", "#D4E9FF"];

/**
 * An identity photo for people without an uploaded one. The mock has no real photos, so it returns a plain
 * silhouette. Only the background tone varies, so two people don't look identical.
 */
export function photoSvg(citizen: Citizen): string {
  const refNumber = parseInt(citizen.ref.replace(/\D/g, ""), 10) || 0;
  const background = BACKGROUND_TONES[refNumber % BACKGROUND_TONES.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="120" height="150" role="img" aria-label="Mock identity photo">
<rect width="120" height="150" fill="${background}"/>
<circle cx="60" cy="58" r="26" fill="#7E8E9B"/>
<path d="M14 150c4-32 22-48 46-48s42 16 46 48z" fill="#7E8E9B"/>
</svg>`;
}
