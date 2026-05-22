import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  real,
  unique,
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

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
    plan: text("plan").notNull(), // 'matching' | 'submissions'
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
    source: text("source").default("upload"),
    status: text("status").default("pending"),
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
