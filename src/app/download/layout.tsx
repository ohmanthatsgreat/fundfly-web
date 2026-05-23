import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Download",
  description:
    "Download the FundFly desktop app for Mac and Windows. Same powerful grant discovery and AI matching, right on your desktop.",
  alternates: {
    canonical: "/download",
  },
  openGraph: {
    title: "Download FundFly Desktop App",
    description:
      "Download the FundFly desktop app for Mac and Windows. Same powerful grant discovery and AI matching, right on your desktop.",
    url: "https://fundfly.app/download",
  },
};

export default function DownloadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
