/**
 * The palette and the text-on-background pairs we promise in DESIGN.md §2.
 * Mirrors the @theme block in app/globals.css; contrast.test.ts checks every pair.
 */
export const palette = {
  white: "#FFFFFF",
  "blue-50": "#EAF4FF",
  "blue-100": "#D4E9FF",
  "blue-200": "#A8D3FF",
  "blue-300": "#6BB5FD",
  "blue-500": "#0082FB",
  "blue-600": "#006FD6",
  "blue-700": "#005FB8",
  "blue-800": "#004A8F",
  "blue-900": "#003366",
  "gray-50": "#F1F5F8",
  "gray-100": "#E3E9EE",
  "gray-200": "#CAD4DC",
  "gray-300": "#A7B4BF",
  "gray-400": "#7E8E9B",
  "gray-500": "#5E6E7B",
  "gray-600": "#47555F",
  "gray-700": "#33414A",
  "gray-900": "#1C2B33",
  "green-50": "#E8F6EE",
  "green-600": "#1A7F4B",
  "green-700": "#146B3E",
  "amber-50": "#FFF4DC",
  "amber-400": "#F2A900",
  "amber-700": "#8A5200",
  "red-50": "#FDECEE",
  "red-600": "#C8202F",
  "red-700": "#A81A27",
} as const;

type Shade = keyof typeof palette;

/** [what, foreground, background, minimum ratio]. 4.5 for text, 3 for UI parts (WCAG 1.4.11). */
export const pairs: [string, Shade, Shade, number][] = [
  ["Body text on page", "gray-900", "gray-50", 4.5],
  ["Body text on surface", "gray-900", "white", 4.5],
  ["Secondary text on surface", "gray-600", "white", 4.5],
  ["Secondary text on page", "gray-600", "gray-50", 4.5],
  ["Muted text on surface", "gray-500", "white", 4.5],
  ["Muted text on page", "gray-500", "gray-50", 4.5],
  ["Secondary text on sunken", "gray-600", "gray-100", 4.5],
  ["Input border on surface", "gray-400", "white", 3],
  ["Primary button label", "white", "blue-600", 4.5],
  ["Primary button hover", "white", "blue-700", 4.5],
  ["Link on surface", "blue-700", "white", 4.5],
  ["Link on page", "blue-700", "gray-50", 4.5],
  ["Text on highlighted card", "gray-900", "blue-50", 4.5],
  ["Info text on tint", "blue-700", "blue-50", 4.5],
  ["Focus ring on surface", "blue-500", "white", 3],
  ["Danger button label", "white", "red-600", 4.5],
  ["Urgent text on tint", "red-700", "red-50", 4.5],
  ["Urgent error text on surface", "red-700", "white", 4.5],
  ["Warning text on tint", "amber-700", "amber-50", 4.5],
  ["Jet on amber fill", "gray-900", "amber-400", 4.5],
  ["Success text on tint", "green-700", "green-50", 4.5],
  ["Success icon on surface", "green-600", "white", 3],
  ["Toast text", "white", "gray-900", 4.5],
];
