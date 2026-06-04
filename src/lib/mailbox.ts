/**
 * Shared helpers for the in-app mailbox (Postmark Inbound + outbound replies).
 */

/** Strip leading Re:/Fwd:/Fw: (repeated) and collapse whitespace. */
export function normalizeSubject(subject: string | null | undefined): string {
  return (subject || "")
    .replace(/^(\s*(re|fwd|fw)\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Group conversations by normalized subject + the external participant's email.
 * The "external participant" is whoever isn't us (@fundfly.app) — for inbound
 * that's the sender, for outbound the recipient.
 */
export function threadKeyFor(
  subject: string | null | undefined,
  externalEmail: string
): string {
  const subj = normalizeSubject(subject) || "(no subject)";
  return `${subj}::${externalEmail.trim().toLowerCase()}`;
}

/** Is this one of our own addresses? */
export function isOurAddress(email: string): boolean {
  return /@fundfly\.app\s*$/i.test(email.trim());
}
