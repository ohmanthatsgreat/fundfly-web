/**
 * Client-side engagement beacon. Fire-and-forget via navigator.sendBeacon so it
 * never blocks navigation or shows errors. Only meaningful for signed-in users
 * (the server attributes events to the Clerk session).
 */

/** Per-tab session id (resets when the tab/browser session ends). */
function sessionId(): string {
  try {
    let id = sessionStorage.getItem("ff_sid");
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem("ff_sid", id);
    }
    return id;
  } catch {
    return "na";
  }
}

function send(payload: Record<string, unknown>) {
  try {
    const body = JSON.stringify({ ...payload, sessionId: sessionId() });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/track",
        new Blob([body], { type: "application/json" })
      );
    } else {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // never throw from tracking
  }
}

export function trackPageView(path: string) {
  send({ type: "page_view", path });
}

/** Track a named user action, e.g. trackAction("start_auto_submit", { planId }). */
export function trackAction(name: string, meta?: Record<string, unknown>) {
  send({ type: "action", name, meta });
}

/** Presence ping — keeps "last seen" fresh while a tab is open + visible, so
 *  the admin online indicator is accurate even when the user isn't navigating.
 *  Doesn't count as a page view. */
export function trackHeartbeat() {
  send({ type: "action", name: "heartbeat" });
}
