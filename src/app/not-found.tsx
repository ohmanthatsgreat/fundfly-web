import Link from "next/link";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { Search } from "lucide-react";

export default function NotFound() {
  return (
    <>
      <MarketingHeader />
      <main className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-6">
            <Search className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-5xl font-bold mb-3">404</h1>
          <p className="text-lg text-muted mb-8">
            This page doesn&apos;t exist — but there are over a million
            opportunities that do.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="bg-accent text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              Go Home
            </Link>
            <Link
              href="/app"
              className="px-6 py-2.5 rounded-lg text-sm font-medium border border-border hover:bg-surface transition-colors"
            >
              Browse Grants
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
