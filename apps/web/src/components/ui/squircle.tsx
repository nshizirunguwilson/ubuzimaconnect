"use client";

import { getSvgPath } from "figma-squircle";
import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ElementType,
  type Ref,
} from "react";
import { cn } from "@/lib/cn";

/** DESIGN.md §5. `xs` exists only for controls smaller than 24 px (checkbox). */
export const RADIUS = { xs: 6, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export type Radius = keyof typeof RADIUS;

/** Figma "iOS" smoothing. The native radius multiplier in globals.css is calibrated against it. */
const SMOOTHING = 0.6;

export type SquircleMode = "native" | "fallback";

const noop = () => () => {};
export function useSquircleMode(): SquircleMode | null {
  return useSyncExternalStore(
    noop,
    () => (document.documentElement.dataset.sq as SquircleMode) ?? "native",
    () => null,
  );
}

type Size = { w: number; h: number };
type Corners = "all" | "top" | "sheet";

const wide = "(min-width: 640px)";
function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(wide);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => matchMedia(wide).matches,
    () => false,
  );
}

type SquircleProps<T extends ElementType> = {
  as?: T;
  radius?: Radius;
  /** Which focus state draws the ring: the element itself, a focused child, or a preceding `.peer` input. */
  focus?: "self" | "within" | "peer" | "none";
  /** The one shadow level, for overlays only (DESIGN.md §6). */
  elevated?: boolean;
  /** "top": top corners only. "sheet": top only on phones, all corners from 640 px (bottom sheet to dialog). */
  corners?: Corners;
  ref?: Ref<HTMLElement>;
} & Omit<ComponentPropsWithoutRef<T>, "as">;

export function Squircle<T extends ElementType = "div">({
  as,
  radius = "md",
  focus = "none",
  elevated = false,
  corners = "all",
  ref,
  className,
  style,
  children,
  ...rest
}: SquircleProps<T>) {
  const Tag: ElementType = as ?? "div";
  const mode = useSquircleMode();
  const local = useRef<HTMLElement | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const r = RADIUS[radius];

  useLayoutEffect(() => {
    const el = local.current;
    if (mode !== "fallback" || !el) return;
    const ro = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize[0];
      setSize({ w: box.inlineSize, h: box.blockSize });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  const setRef = (node: HTMLElement | null) => {
    local.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  const ready = mode === "fallback" && size !== null && size.w > 0;

  return (
    <Tag
      ref={setRef}
      className={cn("sq", className)}
      style={{ "--sq-r": `${r}px`, ...style } as CSSProperties}
      data-sq-focus={focus === "none" ? undefined : focus}
      data-sq-elevated={elevated || undefined}
      data-sq-corners={corners === "all" ? undefined : corners}
      data-sq-ready={ready || undefined}
      {...rest}
    >
      {ready && <SquircleLayer size={size} radius={r} corners={corners} focus={focus !== "none"} />}
      {children}
    </Tag>
  );
}

function path(w: number, h: number, r: number, topOnly: boolean) {
  const bottom = topOnly ? 0 : r;
  return getSvgPath({
    width: w,
    height: h,
    cornerSmoothing: SMOOTHING,
    topLeftCornerRadius: r,
    topRightCornerRadius: r,
    bottomLeftCornerRadius: bottom,
    bottomRightCornerRadius: bottom,
  });
}

/**
 * Paints the squircle in browsers without corner-shape. The SVG sits 4 px outside the
 * border box so the focus ring (2 px gap + 2 px ring) can be drawn on the same curve.
 */
function SquircleLayer({
  size: { w, h },
  radius: r,
  corners,
  focus,
}: {
  size: Size;
  radius: number;
  corners: Corners;
  focus: boolean;
}) {
  const isWide = useWide();
  const topOnly = corners === "top" || (corners === "sheet" && !isWide);
  const pad = 4;
  return (
    <svg aria-hidden className="sq-layer" width={w + pad * 2} height={h + pad * 2}>
      <g transform={`translate(${pad} ${pad})`}>
        <path className="sq-fill" d={path(w - 1, h - 1, r - 0.5, topOnly)} transform="translate(0.5 0.5)" />
        {focus && (
          <g className="sq-focus">
            <path className="sq-gap" d={path(w + 2, h + 2, r + 1, topOnly)} transform="translate(-1 -1)" />
            <path className="sq-ring" d={path(w + 6, h + 6, r + 3, topOnly)} transform="translate(-3 -3)" />
          </g>
        )}
      </g>
    </svg>
  );
}
