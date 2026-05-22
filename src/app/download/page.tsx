"use client";

import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { Download, Apple, Monitor } from "lucide-react";
import { useEffect, useState } from "react";

const releases = {
  macArm: "https://github.com/ohmanthatsgreat/fundfly/releases/download/v1.0.0/FundFly-1.0.0-arm64.dmg",
  macIntel: "https://github.com/ohmanthatsgreat/fundfly/releases/download/v1.0.0/FundFly-1.0.0.dmg",
  windows: "https://github.com/ohmanthatsgreat/fundfly/releases/download/v1.0.0/FundFly.Setup.1.0.0.exe",
};

export default function DownloadPage() {
  const [os, setOs] = useState<"mac" | "windows" | "other">("other");

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) setOs("mac");
    else if (ua.includes("win")) setOs("windows");
  }, []);

  return (
    <>
      <MarketingHeader />

      <section className="py-24">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Download FundFly
          </h1>
          <p className="text-muted text-lg mb-12 max-w-xl mx-auto">
            Get the desktop app for a native experience. All the same features,
            running locally on your machine.
          </p>

          <div className="space-y-4 mb-12">
            {/* Primary download for detected OS */}
            {os === "mac" && (
              <a
                href={releases.macArm}
                className="inline-flex items-center gap-3 bg-accent text-white px-8 py-4 rounded-xl text-lg font-medium hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20"
              >
                <Apple className="w-6 h-6" />
                Download for Mac (Apple Silicon)
                <Download className="w-5 h-5" />
              </a>
            )}

            {os === "windows" && (
              <a
                href={releases.windows}
                className="inline-flex items-center gap-3 bg-accent text-white px-8 py-4 rounded-xl text-lg font-medium hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20"
              >
                <Monitor className="w-6 h-6" />
                Download for Windows
                <Download className="w-5 h-5" />
              </a>
            )}

            {os === "other" && (
              <p className="text-muted">Choose your platform below:</p>
            )}
          </div>

          {/* All platforms */}
          <div className="grid md:grid-cols-3 gap-4 mb-16">
            <a
              href={releases.macArm}
              className="flex flex-col items-center gap-2 border border-border rounded-xl p-6 hover:bg-surface transition-colors"
            >
              <Apple className="w-8 h-8 text-muted mb-1" />
              <span className="font-medium">Mac (Apple Silicon)</span>
              <span className="text-xs text-muted">M1, M2, M3, M4 chips</span>
              <span className="text-xs text-muted">112 MB .dmg</span>
            </a>

            <a
              href={releases.macIntel}
              className="flex flex-col items-center gap-2 border border-border rounded-xl p-6 hover:bg-surface transition-colors"
            >
              <Apple className="w-8 h-8 text-muted mb-1" />
              <span className="font-medium">Mac (Intel)</span>
              <span className="text-xs text-muted">2020 and earlier Macs</span>
              <span className="text-xs text-muted">117 MB .dmg</span>
            </a>

            <a
              href={releases.windows}
              className="flex flex-col items-center gap-2 border border-border rounded-xl p-6 hover:bg-surface transition-colors"
            >
              <Monitor className="w-8 h-8 text-muted mb-1" />
              <span className="font-medium">Windows</span>
              <span className="text-xs text-muted">Windows 10+</span>
              <span className="text-xs text-muted">98 MB .exe</span>
            </a>
          </div>

          {/* System requirements */}
          <div className="bg-surface border border-border rounded-xl p-8 text-left max-w-lg mx-auto">
            <h3 className="font-semibold mb-4">System Requirements</h3>
            <ul className="space-y-2 text-sm text-muted">
              <li>macOS 12+ or Windows 10+</li>
              <li>4 GB RAM minimum (8 GB recommended)</li>
              <li>500 MB disk space</li>
              <li>Internet connection for syncing & AI features</li>
            </ul>
          </div>

          <p className="text-sm text-muted mt-8">
            Prefer to use it in your browser?{" "}
            <a href="/sign-up" className="text-accent hover:underline">
              Sign up for the web app
            </a>
            {" "}— no download required.
          </p>
        </div>
      </section>

      <Footer />
    </>
  );
}
