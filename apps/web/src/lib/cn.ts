import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge our custom squircle paint utilities and type scale.
const twMerge = extendTailwindMerge<"sq-bg" | "sq-border">({
  extend: {
    classGroups: {
      "sq-bg": [{ "sq-bg": [(v: string) => v.length > 0] }],
      "sq-border": [{ "sq-border": [(v: string) => v.length > 0] }],
      "font-size": [{ text: ["display", "h1", "h2", "h3", "body", "small", "caption"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
