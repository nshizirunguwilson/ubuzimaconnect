import type { MetadataRoute } from "next";

/**
 * NFR 8: an installable app (a Progressive Web App) on Android, iPhone and computers. Installing it is also
 * what lets an iPhone receive notifications (D57). Patients start at the welcome page; staff use the browser.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UbuzimaConnect",
    short_name: "Ubuzima",
    description: "Talk to a health agent, get triaged, and reach the right facility.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F1F5F8",
    theme_color: "#F1F5F8",
    lang: "en",
    categories: ["health", "medical"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-1024.png", sizes: "1024x1024", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Emergency: call 912", short_name: "Emergency", url: "/emergency", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] }],
  };
}
