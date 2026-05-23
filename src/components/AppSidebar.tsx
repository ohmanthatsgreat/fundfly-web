"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutGrid,
  Briefcase,
  Beaker,
  User,
  Bookmark,
  Brain,
  FileText,
  Archive,
  Building2,
  UserCircle,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useState } from "react";

const ADMIN_USER_IDS = (process.env.NEXT_PUBLIC_ADMIN_USER_IDS || "")
  .split(",")
  .filter(Boolean);

const baseNavItems = [
  { href: "/app", label: "All Opportunities", icon: LayoutGrid, tour: "nav-all" },
  { href: "/app/biz-grants", label: "Biz Grants", icon: Briefcase, tour: "nav-biz-grants" },
  { href: "/app/sbir", label: "SBIR / STTR", icon: Beaker, tour: "nav-sbir" },
  { href: "/app/personal", label: "Personal Grants", icon: User, tour: "nav-personal" },
  { type: "divider" as const },
  { href: "/app/saved", label: "Saved", icon: Bookmark, tour: "nav-saved" },
  { href: "/app/matches", label: "AI Matches", icon: Brain, tour: "nav-matches" },
  { href: "/app/applications", label: "Applications", icon: FileText, tour: "nav-applications" },
  { href: "/app/archive", label: "Archive", icon: Archive, tour: "nav-archive" },
  { type: "divider" as const },
  { href: "/app/organization", label: "Organization", icon: Building2, tour: "nav-organization" },
  { href: "/app/personal-profile", label: "Personal Profile", icon: UserCircle, tour: "nav-personal-profile" },
  { href: "/app/settings", label: "Settings", icon: Settings, tour: "nav-settings" },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const [collapsed, setCollapsed] = useState(false);

  const isAdmin = user?.id ? ADMIN_USER_IDS.includes(user.id) : false;

  const navItems = isAdmin
    ? [
        ...baseNavItems,
        { type: "divider" as const },
        { href: "/app/admin", label: "Admin", icon: Shield, tour: "nav-admin" },
      ]
    : baseNavItems;

  return (
    <aside
      className={`flex flex-col bg-surface border-r border-border transition-all duration-200 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-border">
        <Link href="/app" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">FF</span>
          </div>
          {!collapsed && (
            <span className="font-semibold text-base tracking-tight">
              FundFly
            </span>
          )}
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-muted hover:text-foreground transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item, i) => {
          if ("type" in item && item.type === "divider") {
            return <div key={i} className="h-px bg-border my-2 mx-2" />;
          }

          const navItem = item as {
            href: string;
            label: string;
            icon: React.ComponentType<{ className?: string }>;
            tour?: string;
          };
          const isActive =
            pathname === navItem.href ||
            (navItem.href !== "/app" && pathname.startsWith(navItem.href));
          const Icon = navItem.icon;

          return (
            <Link
              key={navItem.href}
              href={navItem.href}
              data-tour={navItem.tour}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-muted hover:text-foreground hover:bg-card"
              }`}
              title={collapsed ? navItem.label : undefined}
            >
              <Icon className="w-4.5 h-4.5 shrink-0" />
              {!collapsed && <span>{navItem.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-border p-3 flex items-center gap-3">
        <UserButton />
        {!collapsed && (
          <span className="text-xs text-muted truncate">Account</span>
        )}
      </div>
    </aside>
  );
}
