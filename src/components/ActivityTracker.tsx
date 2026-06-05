"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackPageView, trackHeartbeat } from "@/lib/track";

const HEARTBEAT_MS = 90_000;

/**
 * Mounted once in the authenticated app shell. Fires a page_view beacon on
 * every route change, plus a periodic heartbeat while the tab is visible (so
 * the admin "online" indicator stays accurate). Renders nothing.
 */
export default function ActivityTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  // Page views on navigation.
  useEffect(() => {
    if (pathname && pathname !== last.current) {
      last.current = pathname;
      trackPageView(pathname);
    }
  }, [pathname]);

  // Heartbeat while visible.
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === "visible") trackHeartbeat();
    };
    beat(); // immediate, so presence shows up right away
    const id = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);

  return null;
}
