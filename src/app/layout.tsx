import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import ThemeProvider from "@/components/ThemeProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "FundFly | AI Grant Finder for Businesses & Individuals",
    template: "%s | FundFly",
  },
  description:
    "Find and apply to grants, SBIR funding, and foundation programs. AI-powered matching scores every opportunity against your profile.",
  metadataBase: new URL("https://fundfly.app"),
  alternates: {
    canonical: "/",
  },
  keywords: [
    "grants",
    "grant finder",
    "SBIR",
    "STTR",
    "small business grants",
    "government grants",
    "AI grant matching",
    "grant application",
    "federal funding",
    "foundation grants",
    "personal grants",
  ],
  authors: [{ name: "FundFly" }],
  creator: "FundFly",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://fundfly.app",
    siteName: "FundFly",
    title: "FundFly | AI Grant Finder for Businesses & Individuals",
    description:
      "Find and apply to grants, SBIR funding, and foundation programs. AI-powered matching scores every opportunity against your profile.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "FundFly — AI-powered grant discovery and application platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FundFly | AI Grant Finder for Businesses & Individuals",
    description:
      "Find and apply to grants, SBIR funding, and foundation programs. AI-powered matching scores every opportunity against your profile.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches))document.documentElement.classList.add("dark")}catch(e){}})()`,
            }}
          />
          <link rel="alternate" type="application/rss+xml" title="FundFly Blog" href="/blog/feed" />
          {/* Rewardful affiliate tracking */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(w,r){w._rwq=r;w[r]=w[r]||function(){(w[r].q=w[r].q||[]).push(arguments)}})(window,'rewardful');`,
            }}
          />
          <script async src="https://r.wdfl.co/rw.js" data-rewardful="985d00" />
        </head>
        <body className="min-h-full flex flex-col">
          <ThemeProvider>
            {children}
          </ThemeProvider>
          <Analytics />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
