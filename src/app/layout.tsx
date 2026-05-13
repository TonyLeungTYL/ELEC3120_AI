import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { SupabaseEnvScript } from "@/components/supabase-env-script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Used as the base for absolute URLs in OG tags, sitemap, etc.
// Override at deploy time via NEXT_PUBLIC_SITE_URL if a custom
// domain is configured.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://learningpacer.replit.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "LearningPacer — Virtual TA for ELEC3120 Computer Networks | HKUST",
  description:
    "LearningPacer (NetTutor AI) is an intelligent virtual teaching assistant for HKUST ELEC3120 Computer Networking. Get help with networking concepts, quiz practice, and knowledge browsing.",
  keywords: [
    "LearningPacer",
    "NetTutor AI",
    "ELEC3120",
    "Computer Networks",
    "HKUST",
    "virtual TA",
    "teaching assistant",
  ],
  authors: [{ name: "Group MZ01b-25" }],
  // Explicit positive robots directive. Lighthouse's "Page is blocked
  // from indexing" audit fires whenever it sees a `noindex` meta or a
  // restrictive `X-Robots-Tag` header — Replit's *.replit.dev preview
  // proxy adds the latter so dev URLs aren't crawled. Stating
  // index/follow here makes the production intent explicit and
  // satisfies the audit on the deployed *.replit.app domain.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
    },
  },
  alternates: {
    canonical: "/",
  },
  icons: {
    // Bumped query string to bust browser favicon caches whenever the
    // logo design changes — browsers (especially Chrome) cache favicons
    // very aggressively even across deploys.
    icon: "/logo.svg?v=2",
  },
  openGraph: {
    title: "LearningPacer — Virtual TA for ELEC3120",
    description: "AI-powered teaching assistant for Computer Networking at HKUST",
    type: "website",
    url: SITE_URL,
    siteName: "LearningPacer",
  },
  twitter: {
    card: "summary",
    title: "LearningPacer — Virtual TA for ELEC3120",
    description: "AI-powered teaching assistant for Computer Networking at HKUST",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <SupabaseEnvScript />
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
