# FundFly — Working Backlog

_Last updated: 2026-05-30 (AI cost audit #2 — shipped to prod & deployed)._

**Working method (context-safety):** tackle ONE item — or one batched group — per
**fresh** session. Start each session by reading this file plus only the files named
in that item. Move finished items to "Done" and commit. This keeps each session's
context small so we don't get cut off mid-task.

---

## ✅ Done (this session)
- **Stripe go-live fixed.** Root cause: the Vercel `STRIPE_SECRET_KEY` had been set to
  the key's **ID** (`mk_…`) instead of the real `sk_live_…` secret (Vercel shows
  secrets as blank on edit, which masked it). Replaced → checkout now creates
  `cs_live_…` sessions and redirects correctly. Webhook secret re-entered.
- **Deployed the prior session's fixes:** checkout error surfacing (no more bogus
  "Network error"), Start-Application 400 → ActionToast with profile deep-link,
  trial visibility (mobile badge + admin panel), Zeffy audience ingest fix.

## ⚠️ Still unverified
- **Live webhook end-to-end.** Confirm `STRIPE_WEBHOOK_SECRET` is a `whsec_…` value
  (not a `we_…` endpoint ID). Only a *completed* purchase exercises it. To verify:
  buy the $29 plan once → confirm account unlocks AI Matching → Stripe → Webhooks →
  delivery shows **200** → refund in Stripe.

---

## P0 — correctness / money
1. **Stale test-mode Stripe customer IDs.** ✅ Fixed (2026-05-30).
   Hardened `src/app/api/stripe/checkout/route.ts`: the checkout route now
   catches `resource_missing` on the `customer` param ("No such customer"),
   recreates the Stripe customer live, persists the new id, and retries the
   session once — so stale test-mode ids **self-heal** on the user's next
   checkout instead of hard-failing. No more recurrence risk.
   Optional one-time cleanup (clears any lingering test-mode ids immediately
   instead of waiting for each user's next checkout to heal them):
   `UPDATE customers SET stripe_customer_id = NULL;`

2. **AI cost audit — BLOCKER for pricing.** ✅ Root-caused + instrumented (2026-05-30).
   **Findings:**
   - **The "57 calls from one Enhance click" is NOT a bug — it's a misread.**
     `recordAiUsage` increments `requestCount` by exactly **+1 per Claude API
     call** (`auth.ts`), and the admin "AI spenders" view shows the **per-period
     cumulative** total across ALL features, not per-action. The Enhance endpoint
     fires exactly **1 call per click** (`ai-enhance/route.ts`; frontend sends one
     `fetch`). So the 57 was that user's whole-period total.
   - **Real cost driver = AI Matching, not Enhance.** `matchOpportunities` /
     `matchPersonalOpportunities` (`lib/ai.ts`) load up to `BATCH_LIMIT = 500`
     opps and loop in batches of 20 → **up to 25 Sonnet calls per "Keep
     Searching" scan**, each ~3.5k input + up to 4096 output tokens. ~2 scans
     (50 calls) + a few enhance/generate calls ≈ 57 calls / ~$1.05. Matching is
     where the money goes (~$0.30–$1.20 per full scan).
   - **Rough per-feature unit cost (Sonnet 4.6 @ $3/$15 per Mtok):** enhance ≈ 1¢
     /click · matching ≈ 5¢/call ×25 = up to ~$1.20/scan · full app generation
     (`max_tokens 12000`) ≈ 15–18¢ · single section ≈ 3¢ · submission plan
     (6k out) ≈ 9¢.
   - **Prompt caching evaluated and rejected (2026-05-30):** the only repeated
     content across a scan's 25 batches is the instructions+profile prefix
     (~500-800 tok), which is BELOW Anthropic's 1024-tok cache minimum, so
     caching would be silently ignored. Even if it qualified it's ~5% of scan
     cost, not the ~90% first claimed (that estimate was wrong). Real cost is
     ~⅓ input (scales with opps scanned) + ~⅔ output (scales with matches ×
     rationale). The effective lever is model choice + output length, not
     caching.
   **Shipped this session — DEPLOYED to prod (`main`, Vercel):**
   - New append-only table `ai_usage_events` (`schema.ts`) — one row per call
     with `feature`, `model`, `cost_cents`, and raw token counts. ✅ **Applied to
     prod via `drizzle-kit push`** (the `/drizzle/` dir is gitignored — push
     syncs `schema.ts` → DB directly, no committed migration files). Table
     verified present (10 cols), now logging live.
   - `recordCallCost`/`recordCallCostSync` now take an `AiFeature` arg and log an
     event row in addition to the existing aggregate (`ai-cost.ts`). Aggregate /
     cap logic untouched.
   - Threaded `feature` through all 9 call sites: enhance, match_org,
     match_personal, generate_application, generate_section, submission_plan,
     classify_audience, blog, submission_agent (worker route). (Note: the
     submission_plan + classify_audience tags were initially missed by a
     find/replace and fixed before merge.)
   - Admin endpoint `GET /api/admin/ai-cost` returns a `byFeature` breakdown
     (lifetime cost, calls, tokens, avg cost/call), AND the admin page
     (`app/admin/page.tsx`) renders it as a "Cost by feature" table.
   - **Verify:** `npx tsc --noEmit` passed; `drizzle-kit push` done. Let real
     traffic accrue a day, then read `byFeature` to get true unit costs before #3.

   **Matching cost cut shipped (2026-05-30):**
   - **AI Matching scan moved Sonnet 4.6 → Haiku 4.5** (`MATCH_MODEL` in
     `lib/ai.ts`), used by both `matchOpportunities` and
     `matchPersonalOpportunities`. ~3x cheaper in+out. Sonnet retained for the
     user-facing long-form paths (full app generation, single-section) where
     quality matters.
   - **Output trimmed**: summary + reasoning are now ONE sentence each (was
     1-2 / 2-3); `max_tokens` 4096 → 3072 per batch. The personal-match
     eligibility-filtering rules were preserved verbatim.
   - Combined effect ≈ **70% cheaper per scan** (~$0.90 → ~$0.28 for a 500-opp
     scan). COGS attributes automatically — `ai-cost.ts` already prices the
     Haiku model string, and usage events now log `model` per call so the admin
     `byFeature` view will show the blended rate.
   - Admin "Cost by feature" table added to `app/admin/page.tsx` (renders the
     `byFeature` API data: total, calls, avg/call, tokens).
   - **Watch after deploy:** spot-check a few matches for quality on Haiku. If
     reasoning quality regresses, the fallback is the two-pass design (Haiku
     scores → Sonnet writes reasoning for top matches only).

   **⚠️ Regression caught + fixed same-day (2026-05-30):** the Haiku swap broke
   AI Matching — Haiku nondeterministically returns `"score": "42"` (a STRING),
   while the match-save filter required `typeof m.score === "number"`, so every
   stringified match was silently dropped (scan "completed" with 0 matches and
   still advanced its cursor). Surfaced as personal matching "initiating then
   ending immediately"; org was hitting it intermittently too. **Fix:** added
   `normalizeMatches()` in `lib/ai.ts` (coerces `score` via `Number()`,
   validates with `Number.isFinite`, applied at both parse boundaries; also
   tolerant of the ```json fences Haiku adds) + changed the route filter to
   `Number.isFinite(m.score)`. Deployed (`main` @ `7462f4a`). Personal scan
   cursors reset to 0 so the fixed parser re-scans the ~2,500 opps the bug
   dropped (matches upsert, so re-scan is safe). **Lesson:** swapping models
   changes the JSON-type contract downstream code depends on — validate parse
   output, don't trust the model to emit a given type.

## P1 — monetization redesign (depends on #2)
3. **Prepaid credits model.** Replace/augment flat subscription with AI credits:
   - User sees a credit balance = plan price ($29 / $129 / $399 display value).
   - Internal **actual-cost cap = 50% of display** (2× markup): $129 → $64.50 real
     cost; $399 → $199.50.
   - Track real spend against the cap; prompt to buy more when exhausted, else wait
     for monthly renewal.
   - Auto-adjust as model prices change while preserving the markup (user-facing
     value stays = plan price; internal accounting measures real $).
   - Needs: cost telemetry (#2), markup config, dashboard credit display, top-up
     purchase flow. Worth a product-spec + financial-modeling pass.

4. **Free trial covers ALL AI features**, not just AI Matching. Extend the 3-day
   no-card trial to checklist, generation, submission, etc. Files:
   `/api/app/trial/start`, the feature-gating checks, UpgradeModal copy.

## P2 — UX fixes (batchable in one session)
5. **Guided tour backdrop too dark** — highlighted target is hard to see against the
   overlay. Lighten overlay / sharpen the spotlight cutout. File: TourProvider.
6. **Similar opportunities not clickable** — in the expanded opportunity detail, the
   listed "similar opportunities" don't respond to clicks. Wire the onSelect.
   Files: OpportunityDetail / OpportunityCard.
7. **"Account" text should link to the account page**, not just the avatar circle.
   Files: AppSidebar / header. (Account page is Clerk-hosted — confirm the route.)
8. **More upgrade entry points** — add upgrade CTAs on the Settings page, the account
   area, and more on the dashboard. (Clerk-hosted account page likely needs a custom
   link out to `/pricing`.)

## P3 — matching quality / admin
9. **Personal-grant matching completeness** — ensure ALL personal-profile fields are
   wired into match scoring for personal grants. Audit the matching prompt/inputs vs
   the personal profile schema.
10. **Admin AI-spenders polish** — add pagination if the list grows; surface
    individual AI usage on the tenant cards.
