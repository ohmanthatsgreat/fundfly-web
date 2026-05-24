"use client";

import Link from "next/link";
import { useUser, SignInButton } from "@clerk/nextjs";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export default function MarketingHeader() {
  const { isSignedIn } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <span className="text-white font-bold text-sm">FF</span>
          </div>
          <span className="font-semibold text-lg tracking-tight">FundFly</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-muted">
          <Link href="/#how-it-works" className="hover:text-foreground transition-colors">
            How it Works
          </Link>
          <Link href="/pricing" className="hover:text-foreground transition-colors">
            Pricing
          </Link>
          <Link href="/blog" className="hover:text-foreground transition-colors">
            Blog
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {isSignedIn ? (
            <Link
              href="/app"
              className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              Open App
            </Link>
          ) : (
            <>
              <SignInButton mode="modal">
                <button className="hidden sm:inline text-sm text-muted hover:text-foreground transition-colors">
                  Sign In
                </button>
              </SignInButton>
              <Link
                href="/sign-up"
                className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                Get Started Free
              </Link>
            </>
          )}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-muted hover:text-foreground transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background/95 backdrop-blur-md">
          <nav className="flex flex-col px-6 py-4 space-y-3 text-sm">
            <Link
              href="/#how-it-works"
              onClick={() => setMobileOpen(false)}
              className="text-muted hover:text-foreground transition-colors py-1"
            >
              How it Works
            </Link>
            <Link
              href="/pricing"
              onClick={() => setMobileOpen(false)}
              className="text-muted hover:text-foreground transition-colors py-1"
            >
              Pricing
            </Link>
            <Link
              href="/blog"
              onClick={() => setMobileOpen(false)}
              className="text-muted hover:text-foreground transition-colors py-1"
            >
              Blog
            </Link>
            {!isSignedIn && (
              <SignInButton mode="modal">
                <button className="text-left text-muted hover:text-foreground transition-colors py-1">
                  Sign In
                </button>
              </SignInButton>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
