import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  real,
  unique,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ─── Part 1: Desktop App Backend Tables ─────────────────────────────

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Ledger of every product/lifecycle email we send. Powers idempotency:
 * `(kind, dedupKey)` is unique, so a send is attempted at most once per logical
 * event (welcome→clerkUserId, submission→applicationId, trial_ending→periodEnd,
 * inactive_nudge→clerkUserId+step, etc.). sendOnce() inserts here first and
 * treats a unique-violation as "already sent" — which also guards against races
 * and webhook retries. Bulk/marketing kinds should use the Postmark broadcast
 * stream; transactional kinds use the default outbound stream.
 */
export const emailEvents = pgTable(
  "email_events",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id"),
    toEmail: text("to_email").notNull(),
    kind: text("kind").notNull(),
    // Uniqueness scope for this kind (e.g. the clerk user id, application id,
    // billing period end). Always set so the unique index can enforce once-only.
    dedupKey: text("dedup_key").notNull(),
    status: text("status").notNull().default("sent"), // 'sent' | 'failed'
    providerId: text("provider_id"), // Postmark MessageID
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_email_kind_dedup").on(t.kind, t.dedupKey),
    index("idx_email_user").on(t.clerkUserId),
  ]
);

/**
 * Shared inbox for @fundfly.app mail, viewable/answerable in the admin panel.
 * Holds BOTH directions so a conversation threads naturally:
 *   - 'in'  rows come from the Postmark Inbound webhook
 *   - 'out' rows are replies/new mail we send via Postmark outbound
 * Grouped by `threadKey` (normalized subject + the external participant).
 */
export const mailboxMessages = pgTable(
  "mailbox_messages",
  {
    id: serial("id").primaryKey(),
    direction: text("direction").notNull(), // 'in' | 'out'
    threadKey: text("thread_key").notNull(),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    toEmail: text("to_email").notNull(),
    subject: text("subject"),
    textBody: text("text_body"),
    htmlBody: text("html_body"),
    // Postmark's reply-only text (quoted history stripped) — nicer to display.
    strippedReply: text("stripped_reply"),
    messageId: text("message_id"), // RFC Message-ID header (inbound) / generated (outbound)
    inReplyTo: text("in_reply_to"),
    providerId: text("provider_id"), // Postmark outbound MessageID
    isRead: boolean("is_read").default(false).notNull(),
    isArchived: boolean("is_archived").default(false).notNull(),
    attachmentsCount: integer("attachments_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_mailbox_thread").on(t.threadKey),
    index("idx_mailbox_created").on(t.createdAt),
    // Dedup inbound retries (Postmark may POST twice). Outbound msgids are also
    // unique; NULLs are allowed multiple times in Postgres unique indexes.
    uniqueIndex("uq_mailbox_msgid").on(t.messageId),
  ]
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
    plan: text("plan").notNull(), // 'matching' | 'checklist' | 'auto_submission' | 'bundle'
    status: text("status").notNull(), // 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing' | 'paused'
    currentPeriodEnd: timestamp("current_period_end").notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("idx_sub_customer").on(t.customerId)]
);

export const licenseKeys = pgTable(
  "license_keys",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull().unique(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    plan: text("plan").notNull(), // 'matching' | 'submissions'
    active: boolean("active").default(true).notNull(),
    machineId: text("machine_id"),
    lastValidatedAt: timestamp("last_validated_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_key_customer").on(t.customerId)]
);

// ─── Part 2: Web App Tables ─────────────────────────────────────────

export const opportunities = pgTable(
  "opportunities",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
    title: text("title").notNull(),
    description: text("description"),
    agency: text("agency"),
    subAgency: text("sub_agency"),
    type: text("type").notNull(), // 'grant' | 'sbir' | 'sttr' | 'foundation' | 'personal'
    fundingMin: integer("funding_min"),
    fundingMax: integer("funding_max"),
    deadline: text("deadline"),
    postedDate: text("posted_date"),
    eligibilityTypes: text("eligibility_types"),
    eligibilityCategories: text("eligibility_categories"),
    cfdaNumber: text("cfda_number"),
    status: text("status").default("open"),
    audience: text("audience").default("business"), // 'business' | 'personal' | 'both'
    // SHA256 of (title + description + categories) at last AI classification.
    // If the source content matches, we skip re-classifying. Only meaningful
    // for sources where audience is AI-classified (Zeffy today).
    audienceClassifiedHash: text("audience_classified_hash"),
    location: text("location"),
    applicantTypes: text("applicant_types"),
    categories: text("categories"),
    contactInfo: text("contact_info"),
    matchingFunds: text("matching_funds"),
    grantUrl: text("grant_url"),
    rawJson: text("raw_json"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("idx_opp_type").on(t.type),
    index("idx_opp_status").on(t.status),
    index("idx_opp_deadline").on(t.deadline),
    index("idx_opp_agency").on(t.agency),
    index("idx_opp_audience").on(t.audience),
    index("idx_opp_source").on(t.source),
  ]
);

export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  orgName: text("org_name"),
  orgType: text("org_type"),
  ein: text("ein"),
  uei: text("uei"),
  samRegistered: boolean("sam_registered").default(false),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  website: text("website"),
  naicsCodes: text("naics_codes"),
  missionStatement: text("mission_statement"),
  productsServices: text("products_services"),
  areasOfExpertise: text("areas_of_expertise"),
  certifications: text("certifications"),
  pastGrantExperience: text("past_grant_experience"),
  annualRevenue: text("annual_revenue"),
  employeeCount: text("employee_count"),
  yearFounded: text("year_founded"),
  technologyReadinessLevel: text("technology_readiness_level"),
  geographicFocus: text("geographic_focus"),
  // Federal submission fields (added 2026-05-27) — frequently required on
  // Grants.gov / SAM.gov / SBIR forms.
  cageCode: text("cage_code"),
  congressionalDistrict: text("congressional_district"),
  indirectCostRate: text("indirect_cost_rate"), // NICRA % or "10% de minimis"
  authorizedRepName: text("authorized_rep_name"), // AOR for Grants.gov
  authorizedRepTitle: text("authorized_rep_title"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const personalProfiles = pgTable("personal_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  fullName: text("full_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  dateOfBirth: text("date_of_birth"),
  citizenship: text("citizenship"),
  veteranStatus: text("veteran_status"),
  disabilityStatus: text("disability_status"),
  gender: text("gender"),
  raceEthnicity: text("race_ethnicity"),
  householdSize: text("household_size"),
  annualIncome: text("annual_income"),
  employmentStatus: text("employment_status"),
  educationLevel: text("education_level"),
  fieldOfStudy: text("field_of_study"),
  currentSchool: text("current_school"),
  skills: text("skills"),
  interests: text("interests"),
  housingStatus: text("housing_status"),
  // Narrative fields — used by AI to write personal application sections
  // (personal statement, project proposal, etc.). Added 2026-05-24.
  bio: text("bio"),
  personalMission: text("personal_mission"),
  projectGoals: text("project_goals"),
  intendedUseOfFunds: text("intended_use_of_funds"),
  pastAchievements: text("past_achievements"),
  portfolioLinks: text("portfolio_links"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const savedOpportunities = pgTable(
  "saved_opportunities",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id),
    notes: text("notes"),
    savedAt: timestamp("saved_at").defaultNow(),
  },
  (t) => [
    unique("uq_saved").on(t.userId, t.opportunityId),
    index("idx_saved_user").on(t.userId),
  ]
);

export const applications = pgTable(
  "applications",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id),
    status: text("status").default("draft"),
    // 'business' = uses org profile + org section template
    // 'personal' = uses personal profile + personal section template
    mode: text("mode").default("business"),
    notes: text("notes"),
    submittedAt: timestamp("submitted_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    unique("uq_app").on(t.userId, t.opportunityId),
    index("idx_app_user").on(t.userId),
  ]
);

export const applicationSections = pgTable(
  "application_sections",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    sectionKey: text("section_key").notNull(),
    sectionTitle: text("section_title").notNull(),
    content: text("content").default(""),
    sortOrder: integer("sort_order").default(0),
    completed: boolean("completed").default(false),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [unique("uq_app_section").on(t.applicationId, t.sectionKey)]
);

export const applicationDocuments = pgTable(
  "application_documents",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    filename: text("filename").notNull(),
    fileUrl: text("file_url"),
    fileSize: integer("file_size").default(0),
    mimeType: text("mime_type").default("application/pdf"),
    source: text("source").default("upload"), // 'upload' | 'ai_generated' | 'linked_section'
    status: text("status").default("pending"),
    stepNumber: integer("step_number"),
    artifactName: text("artifact_name"),
    aiGeneratedContent: text("ai_generated_content"),
    generationPrompt: text("generation_prompt"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("idx_app_docs").on(t.applicationId)]
);

export const aiMatches = pgTable(
  "ai_matches",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id),
    matchMode: text("match_mode").notNull().default("org"),
    score: real("score").notNull(),
    summary: text("summary"),
    matchReasoning: text("match_reasoning"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    unique("uq_match").on(t.userId, t.opportunityId, t.matchMode),
    index("idx_matches_user").on(t.userId),
    index("idx_matches_score").on(t.score),
  ]
);

/**
 * Per-user, per-mode scan cursor for the AI matcher. The scan walks the
 * eligible opportunity set with a stable ORDER BY id + OFFSET; persisting the
 * offset server-side means the scan resumes where it left off after the user
 * navigates away (instead of re-scanning the same first batch forever).
 */
export const matchScanState = pgTable(
  "match_scan_state",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    mode: text("mode").notNull().default("org"), // 'org' | 'personal'
    scanOffset: integer("scan_offset").default(0).notNull(),
    scannedCount: integer("scanned_count").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [unique("uq_scan_state").on(t.userId, t.mode)]
);

/**
 * App-managed free trials. No card is required to start (so these are NOT
 * Stripe subscriptions). A trial grants the chosen plan's features until
 * `endsAt`. checkSubscription/getUserFeatures honor an active trial.
 */
export const trials = pgTable(
  "trials",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().unique(),
    plan: text("plan").notNull(), // 'matching' | 'checklist' | 'auto_submission' | 'bundle'
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endsAt: timestamp("ends_at").notNull(),
    converted: boolean("converted").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_trials_user").on(t.userId)]
);

export const dismissedOpportunities = pgTable(
  "dismissed_opportunities",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id),
    reason: text("reason").default("not_interested"),
    dismissedAt: timestamp("dismissed_at").defaultNow(),
  },
  (t) => [
    unique("uq_dismissed").on(t.userId, t.opportunityId),
    index("idx_dismissed_user").on(t.userId),
  ]
);

export const generatedApplications = pgTable(
  "generated_applications",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id),
    narrative: text("narrative").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [unique("uq_gen_app").on(t.userId, t.opportunityId)]
);

export const submissionPlans = pgTable(
  "submission_plans",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    planJson: text("plan_json").notNull(),
    status: text("status").default("pending"),
    currentStep: integer("current_step").default(0),
    artifactsJson: text("artifacts_json").default("{}"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [unique("uq_sub_plan").on(t.applicationId)]
);

// ─── AI Usage & Credits ────────────────────────────────────────────

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    periodStart: timestamp("period_start").notNull(), // billing period start
    totalCostCents: integer("total_cost_cents").default(0).notNull(), // cumulative AI cost in cents
    requestCount: integer("request_count").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    unique("uq_ai_usage_period").on(t.userId, t.periodStart),
    index("idx_ai_usage_user").on(t.userId),
  ]
);

export const aiCredits = pgTable(
  "ai_credits",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().unique(),
    balanceCents: integer("balance_cents").default(0).notNull(), // purchased credits remaining
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("idx_ai_credits_user").on(t.userId)]
);

/**
 * Ledger of credit-pack purchases. `sessionId` (the Stripe Checkout Session id)
 * is UNIQUE — it's the idempotency key so a retried webhook can't double-credit.
 * displayCents = what the user paid; realCents = headroom added to the cap.
 */
export const creditTopups = pgTable(
  "credit_topups",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    sessionId: text("session_id").notNull().unique(),
    displayCents: integer("display_cents").notNull(),
    realCents: integer("real_cents").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("idx_credit_topups_user").on(t.userId)]
);

/**
 * Append-only per-call AI usage log. Unlike `ai_usage` (which is a per-period
 * aggregate used for the cap meter), this records one row per Claude API call
 * with the feature that triggered it and the raw token counts — so we can see
 * the REAL unit cost of each feature (enhance, matching, generation, etc.)
 * before designing the credits pricing model. `userId` is the Clerk id, or
 * "__system__" for system-level calls (cron blog, audience classification).
 */
export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    feature: text("feature").notNull(), // see AiFeature in lib/ai-cost.ts
    model: text("model").notNull(),
    costCents: integer("cost_cents").default(0).notNull(),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    cacheReadTokens: integer("cache_read_tokens").default(0).notNull(),
    cacheWriteTokens: integer("cache_write_tokens").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_ai_events_user").on(t.userId),
    index("idx_ai_events_feature").on(t.feature),
    index("idx_ai_events_created").on(t.createdAt),
  ]
);

// ─── Blog Posts ───────────────────────────────────────────────────

export const blogPosts = pgTable(
  "blog_posts",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(),
    content: text("content").notNull(), // markdown
    metaDescription: text("meta_description"),
    metaKeywords: text("meta_keywords"),
    category: text("category").notNull(), // 'grants' | 'sbir' | 'tips' | 'news' | 'personal'
    tags: text("tags"), // comma-separated
    author: text("author").default("FundFly Team"),
    status: text("status").default("draft"), // 'draft' | 'published'
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_blog_slug").on(t.slug),
    index("idx_blog_status").on(t.status),
    index("idx_blog_published").on(t.publishedAt),
    index("idx_blog_category").on(t.category),
  ]
);

export const userSettings = pgTable(
  "user_settings",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    unique("uq_setting").on(t.userId, t.key),
    index("idx_settings_user").on(t.userId),
  ]
);

/**
 * Encrypted credentials for grant portals (sam.gov, grants.gov, etc.).
 * Username/password stored as AES-256-GCM ciphertext. MFA codes never stored.
 */
export const portalCredentials = pgTable(
  "portal_credentials",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    portalDomain: text("portal_domain").notNull(), // e.g. "sam.gov", "login.gov"
    portalLabel: text("portal_label"), // optional friendly name
    usernameEnc: text("username_enc").notNull(),
    passwordEnc: text("password_enc").notNull(),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    unique("uq_portal_cred").on(t.userId, t.portalDomain),
    index("idx_portal_creds_user").on(t.userId),
  ]
);
