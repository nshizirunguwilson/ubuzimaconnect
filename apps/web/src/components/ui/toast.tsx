"use client";

import { Toaster as Sonner, toast as sonner } from "sonner";
import { LuCircleAlert, LuCircleCheck, LuX } from "react-icons/lu";
import { Squircle } from "./squircle";

/**
 * Toasts (DESIGN.md §9): a short past-tense message ("Case submitted").
 * Success closes itself after 4 s; errors stay until dismissed.
 */
export function Toaster() {
  return <Sonner position="bottom-center" gap={8} offset={16} mobileOffset={16} toastOptions={{ unstyled: true }} />;
}

function show(kind: "success" | "error", message: string) {
  const Icon = kind === "success" ? LuCircleCheck : LuCircleAlert;
  return sonner.custom(
    (id) => (
      <Squircle
        radius="md"
        elevated
        role={kind === "error" ? "alert" : "status"}
        className="flex w-[min(24rem,calc(100vw-2rem))] items-center gap-3 py-2 pr-2 pl-4 sq-bg-gray-900 text-white"
      >
        <Icon className={kind === "success" ? "size-5 shrink-0 text-green-50" : "size-5 shrink-0 text-red-50"} aria-hidden />
        <p className="flex-1 text-small font-medium">{message}</p>
        <Squircle
          as="button"
          type="button"
          radius="sm"
          focus="self"
          aria-label="Dismiss"
          onClick={() => sonner.dismiss(id)}
          className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center text-gray-200 hover:sq-bg-gray-700"
        >
          <LuX className="size-5" aria-hidden />
        </Squircle>
      </Squircle>
    ),
    { duration: kind === "error" ? Infinity : 4000 },
  );
}

export const toast = {
  success: (message: string) => show("success", message),
  error: (message: string) => show("error", message),
};
