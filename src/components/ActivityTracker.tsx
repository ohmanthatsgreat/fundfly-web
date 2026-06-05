"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/track";

/**
 * Mounted once in the authenticated app shell. Fires a page_view beacon on
 * every route change (and the initial load). Renders nothing.
 */
export default function ActivityTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (pathname && pathname !== last.current) {
      last.current = pathname;
      trackPageView(pathname);
    }
  }, [pathname]);

  return null;
}
