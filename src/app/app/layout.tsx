"use client";

import AppSidebar from "@/components/AppSidebar";
import TourProvider from "@/components/TourProvider";
import MobileTrialBadge from "@/components/MobileTrialBadge";
import ActivityTracker from "@/components/ActivityTracker";
import { useState } from "react";
import { Menu } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-surface border-b border-border flex items-center px-4 gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 text-muted hover:text-foreground transition-colors"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
            <span className="text-white font-bold text-xs">FF</span>
          </div>
          <span className="font-semibold text-sm">FundFly</span>
        </div>
        <MobileTrialBadge />
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed md:relative z-50 md:z-auto h-full transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <AppSidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">{children}</main>
      <TourProvider />
      <ActivityTracker />
    </div>
  );
}
