import type { Metadata, Viewport } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import { Outfit } from "next/font/google";
import { ServiceWorker } from "@/components/app/service-worker";
import { Toaster } from "@/components/ui/toast";
import { squircleModeScript } from "@/lib/squircle-mode";
import "./globals.css";

// Outfit for headings, Google Sans Flex for everything else, Google Sans Code for codes and IDs.
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

// The two Google Sans families are kept in ./fonts (variable fonts, Latin characters, SIL Open Font License),
// because the build can no longer fetch them from Google reliably. Next.js has no fallback metrics for them,
// so it can't size a fallback font: adjustFontFallback is off.
const sansFlex = localFont({
  src: "./fonts/google-sans-flex-latin.woff2",
  weight: "1 1000",
  display: "swap",
  variable: "--font-google-sans-flex",
  adjustFontFallback: false,
});
const sansCode = localFont({
  src: "./fonts/google-sans-code-latin.woff2",
  weight: "300 800",
  display: "swap",
  variable: "--font-google-sans-code",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: { default: "UbuzimaConnect", template: "%s · UbuzimaConnect" },
  description: "Talk to a health agent, get triaged, and reach the right facility.",
  applicationName: "UbuzimaConnect",
  // iPhone: open full screen from the Home Screen, with the app's own name.
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
        {/* Sets <html data-sq> before the page is interactive */}
        <Script id="squircle-mode" strategy="beforeInteractive">
          {squircleModeScript}
        </Script>
      </body>
    </html>
  );
}
