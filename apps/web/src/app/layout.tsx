import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Google_Sans_Code, Google_Sans_Flex, Outfit } from "next/font/google";
import { ServiceWorker } from "@/components/app/service-worker";
import { Toaster } from "@/components/ui/toast";
import { squircleModeScript } from "@/lib/squircle-mode";
import "./globals.css";

// DESIGN.md §3: Outfit for headings, Google Sans Flex for everything else, Google Sans Code for codes and IDs.
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
// Next.js has no fallback metrics for these two families yet, so it can't size a fallback font; say so explicitly.
const sansFlex = Google_Sans_Flex({ subsets: ["latin"], axes: ["opsz"], variable: "--font-google-sans-flex", adjustFontFallback: false });
const sansCode = Google_Sans_Code({ subsets: ["latin"], variable: "--font-google-sans-code", adjustFontFallback: false });

export const metadata: Metadata = {
  title: { default: "UbuzimaConnect", template: "%s · UbuzimaConnect" },
  description: "Talk to a health agent, get triaged, and reach the right facility.",
  applicationName: "UbuzimaConnect",
  // iPhone: open full screen from the Home Screen, with the app's own name (NFR 8).
  appleWebApp: { capable: true, title: "Ubuzima", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#F1F5F8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${sansFlex.variable} ${sansCode.variable} antialiased`}
    >
      <body className="min-h-dvh">
        {children}
        <Toaster />
        <ServiceWorker />
        {/* Sets <html data-sq> before the page is interactive (DECISIONS.md D4) */}
        <Script id="squircle-mode" strategy="beforeInteractive">
          {squircleModeScript}
        </Script>
      </body>
    </html>
  );
}
