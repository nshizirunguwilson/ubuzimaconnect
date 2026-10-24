"use client";

import { useState, type ComponentProps } from "react";
import { LuEye, LuEyeOff } from "react-icons/lu";
import { Input } from "@/components/ui/field";
import { Squircle } from "@/components/ui/squircle";

/** A password field with Show / Hide, so people can check what they typed (NIST SP 800-63B). */
export function PasswordInput(props: Omit<ComponentProps<typeof Input>, "type" | "trailing">) {
  const [shown, setShown] = useState(false);
  return (
    <Input
      {...props}
      type={shown ? "text" : "password"}
      trailing={
        <Squircle
          as="button"
          type="button"
          radius="sm"
          focus="self"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          className="inline-flex h-10 cursor-pointer items-center gap-1.5 px-2.5 text-small font-medium text-fg-secondary hover:sq-bg-sunken"
        >
          {shown ? <LuEyeOff className="size-5" aria-hidden /> : <LuEye className="size-5" aria-hidden />}
          {shown ? "Hide" : "Show"}
        </Squircle>
      }
    />
  );
}
