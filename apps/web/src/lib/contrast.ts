/** WCAG 2.2 contrast ratio between two hex colours (#RRGGBB). */
export function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function luminance(hex: string): number {
  const rgb = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255].map((channel) => {
    const fraction = channel / 255;
    return fraction <= 0.04045 ? fraction / 12.92 : ((fraction + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
