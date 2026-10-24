"use client";

import { api } from "./api";

export type PushState = "unsupported" | "blocked" | "off" | "on";

/** Web Push needs a service worker, the Push API and notifications; Safari on iPhone only inside an installed app. */
export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** The same worker the app registers (components/app/service-worker.tsx); a different address would replace it. */
export const SW_URL = process.env.NODE_ENV === "production" ? "/sw.js?cache=1" : "/sw.js";

async function registration() {
  return navigator.serviceWorker.register(SW_URL, { scope: "/" });
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const sub = await (await registration()).pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** The browser's own permission prompt, then the subscription saved on the server for this person. */
export async function turnOnPush(): Promise<PushState> {
  const { publicKey } = await api<{ publicKey: string | null }>("/push/key");
  if (!publicKey) throw new Error("Notifications aren't set up on this server.");
  if ((await Notification.requestPermission()) !== "granted") return Notification.permission === "denied" ? "blocked" : "off";
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(publicKey) }));
  await api("/push/subscriptions", sub.toJSON());
  return "on";
}

export async function turnOffPush(): Promise<PushState> {
  const sub = await (await registration()).pushManager.getSubscription();
  if (sub) {
    await api("/push/subscriptions", { endpoint: sub.endpoint }, { method: "DELETE" }).catch(() => null);
    await sub.unsubscribe();
  }
  return "off";
}

/** The VAPID public key is base64url; the Push API wants the raw bytes. */
function key(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
