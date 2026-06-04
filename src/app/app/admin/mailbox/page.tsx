"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Mail,
  Inbox,
  Loader2,
  RefreshCw,
  ChevronLeft,
  Send,
  PenSquare,
  X,
  CornerUpLeft,
  Paperclip,
} from "lucide-react";

type Thread = {
  threadKey: string;
  subject: string | null;
  participant: string;
  lastAt: string;
  lastDirection: string;
  lastSnippet: string;
  unread: number;
  count: number;
};

type Message = {
  id: number;
  direction: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
  strippedReply: string | null;
  attachmentsCount: number;
  createdAt: string;
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function MailboxPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [active, setActive] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [composing, setComposing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/mailbox");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const data = await res.json();
      setThreads(data.threads || []);
      setTotalUnread(data.totalUnread || 0);
    } catch {
      // keep prior state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const openThread = useCallback(
    async (t: Thread) => {
      setActive(t);
      setMessages([]);
      setLoadingThread(true);
      try {
        const res = await fetch(
          `/api/admin/mailbox?thread=${encodeURIComponent(t.threadKey)}`
        );
        const data = await res.json();
        setMessages(data.messages || []);
        // It's now read — clear its unread locally + refresh counts.
        setThreads((prev) =>
          prev.map((x) =>
            x.threadKey === t.threadKey ? { ...x, unread: 0 } : x
          )
        );
        setTotalUnread((u) => Math.max(0, u - t.unread));
      } catch {
        // ignore
      } finally {
        setLoadingThread(false);
      }
    },
    []
  );

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendReply() {
    if (!active || !reply.trim()) return;
    setSending(true);
    const lastInbound = [...messages].reverse().find((m) => m.direction === "in");
    const to = active.participant;
    const subject = active.subject?.match(/^re:/i)
      ? active.subject
      : `Re: ${active.subject || "(no subject)"}`;
    // Reply from the address they originally wrote to, when we know it.
    const from = lastInbound?.toEmail || undefined;
    try {
      const res = await fetch("/api/admin/mailbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          text: reply.trim(),
          from,
          threadKey: active.threadKey,
        }),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        setMessages((prev) => [...prev, data.message]);
        setReply("");
        loadThreads();
      } else {
        alert(data.error || "Failed to send");
      }
    } catch {
      alert("Network error");
    }
    setSending(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Mail className="w-10 h-10 text-muted" />
        <h2 className="text-lg font-semibold">Access Denied</h2>
        <p className="text-sm text-muted">You do not have admin permissions.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <a
            href="/app/admin"
            className="text-muted hover:text-foreground transition-colors"
            title="Back to admin"
          >
            <ChevronLeft className="w-5 h-5" />
          </a>
          <Inbox className="w-5 h-5 text-accent" />
          <h1 className="text-2xl font-bold">Mailbox</h1>
          {totalUnread > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent text-white">
              {totalUnread} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadThreads}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-surface transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={() => setComposing(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
          >
            <PenSquare className="w-3.5 h-3.5" /> Compose
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-200px)]">
        {/* Thread list */}
        <div className="bg-card border border-border rounded-xl overflow-y-auto">
          {threads.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">
              <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No messages yet. Once MX is pointed at Postmark, incoming mail to
              @fundfly.app appears here.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {threads.map((t) => (
                <li key={t.threadKey}>
                  <button
                    onClick={() => openThread(t)}
                    className={`w-full text-left p-3.5 hover:bg-surface/60 transition-colors ${
                      active?.threadKey === t.threadKey ? "bg-surface" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={`flex-1 min-w-0 truncate text-sm ${
                          t.unread > 0 ? "font-bold" : "font-medium"
                        }`}
                      >
                        {t.participant}
                      </span>
                      {t.unread > 0 && (
                        <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                      )}
                      <span className="text-[11px] text-muted shrink-0">
                        {fmtWhen(t.lastAt)}
                      </span>
                    </div>
                    <div className="text-xs font-medium truncate text-foreground/80">
                      {t.lastDirection === "out" && (
                        <CornerUpLeft className="w-3 h-3 inline mr-1 text-muted" />
                      )}
                      {t.subject || "(no subject)"}
                    </div>
                    <div className="text-[11px] text-muted truncate mt-0.5">
                      {t.lastSnippet}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Conversation */}
        <div className="bg-card border border-border rounded-xl flex flex-col min-h-0">
          {!active ? (
            <div className="flex-1 flex flex-col items-center justify-center text-sm text-muted">
              <Mail className="w-10 h-10 mb-2 opacity-40" />
              Select a conversation
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border">
                <div className="font-semibold text-sm truncate">
                  {active.subject || "(no subject)"}
                </div>
                <div className="text-xs text-muted truncate">
                  {active.participant}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingThread ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted" />
                  </div>
                ) : (
                  messages.map((m) => {
                    const mine = m.direction === "out";
                    return (
                      <div
                        key={m.id}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                            mine
                              ? "bg-accent text-white rounded-br-sm"
                              : "bg-surface border border-border rounded-bl-sm"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1 text-[11px] opacity-80">
                            <span className="font-medium truncate">
                              {mine
                                ? "You"
                                : m.fromName || m.fromEmail}
                            </span>
                            <span>·</span>
                            <span>{fmtWhen(m.createdAt)}</span>
                            {m.attachmentsCount > 0 && (
                              <span className="inline-flex items-center gap-0.5">
                                <Paperclip className="w-3 h-3" />
                                {m.attachmentsCount}
                              </span>
                            )}
                          </div>
                          <div className="whitespace-pre-wrap break-words">
                            {m.strippedReply || m.textBody || "(no text body)"}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={endRef} />
              </div>

              {/* Reply box */}
              <div className="border-t border-border p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        (e.metaKey || e.ctrlKey) &&
                        e.key === "Enter" &&
                        reply.trim()
                      ) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                    rows={2}
                    placeholder={`Reply to ${active.participant}…  (⌘+Enter to send)`}
                    className="flex-1 px-3 py-2 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:border-accent resize-y"
                  />
                  <button
                    onClick={sendReply}
                    disabled={sending || !reply.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {composing && (
        <ComposeModal
          onClose={() => setComposing(false)}
          onSent={() => {
            setComposing(false);
            loadThreads();
          }}
        />
      )}
    </div>
  );
}

function ComposeModal({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [from, setFrom] = useState("hello@fundfly.app");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/mailbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, text, from }),
      });
      const data = await res.json();
      if (res.ok) onSent();
      else setError(data.error || "Failed to send");
    } catch {
      setError("Network error");
    }
    setSending(false);
  }

  const input =
    "w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:border-accent";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <PenSquare className="w-4 h-4 text-accent" /> New message
          </h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted w-12">From</label>
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={input}
            >
              <option value="hello@fundfly.app">hello@fundfly.app</option>
              <option value="support@fundfly.app">support@fundfly.app</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted w-12">To</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className={input}
            />
          </div>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className={input}
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="Write your message…"
            className={`${input} resize-y`}
          />
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={send}
            disabled={sending || !to || !subject || !text}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
