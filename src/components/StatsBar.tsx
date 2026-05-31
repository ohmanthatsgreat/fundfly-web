"use client";

import Link from "next/link";
import { TrendingUp, Clock, Bookmark, ClipboardList } from "lucide-react";

type Stats = {
  total: number;
  grants: number;
  sbir: number;
  saved: number;
  applications: number;
  closingSoon: number;
};

const cards: {
  label: string;
  key: keyof Stats;
  icon: typeof TrendingUp;
  color: string;
  bg: string;
  iconBg: string;
  href?: string;
}[] = [
  {
    label: "Total Opportunities",
    key: "total",
    icon: TrendingUp,
    color: "text-accent",
    bg: "bg-accent/5",
    iconBg: "bg-accent/10",
  },
  {
    label: "Closing This Week",
    key: "closingSoon",
    icon: Clock,
    color: "text-amber-500",
    bg: "bg-amber-500/5",
    iconBg: "bg-amber-500/10",
  },
  {
    label: "Saved",
    key: "saved",
    icon: Bookmark,
    color: "text-purple-500",
    bg: "bg-purple-500/5",
    iconBg: "bg-purple-500/10",
    href: "/app/saved",
  },
  {
    label: "Applications",
    key: "applications",
    icon: ClipboardList,
    color: "text-emerald-500",
    bg: "bg-emerald-500/5",
    iconBg: "bg-emerald-500/10",
    href: "/app/applications",
  },
];

export default function StatsBar({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        const className = `relative overflow-hidden ${card.bg} border border-border rounded-2xl p-4 shadow-xs transition-all duration-200 ${
          card.href
            ? "hover:border-accent/40 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            : "hover:border-accent/20 hover:shadow-md"
        }`;
        const inner = (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">
                {card.label}
              </span>
              <div
                className={`w-8 h-8 rounded-lg ${card.iconBg} flex items-center justify-center`}
              >
                <Icon size={15} className={card.color} />
              </div>
            </div>
            <p className="text-[1.7rem] leading-none font-bold tabular-nums tracking-tight">
              {stats[card.key].toLocaleString()}
            </p>
          </>
        );

        return card.href ? (
          <Link key={card.label} href={card.href} className={`block ${className}`}>
            {inner}
          </Link>
        ) : (
          <div key={card.label} className={className}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
