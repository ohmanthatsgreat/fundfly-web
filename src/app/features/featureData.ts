import {
  Search,
  Brain,
  FileText,
  BarChart3,
  Shield,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type FeatureStep = {
  title: string;
  desc: string;
};

export type Feature = {
  slug: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  tagline: string;
  intro: string;
  steps: FeatureStep[];
  /** Plan this feature is unlocked by, for the closing CTA copy. */
  plan?: string;
};

export const FEATURES: Feature[] = [
  {
    slug: "browse-search",
    icon: Search,
    eyebrow: "Step 01 · Discover",
    title: "Browse & Search",
    tagline: "Every funding source, one searchable home.",
    intro:
      "Grants.gov, SBIR.gov, state portals, and foundation databases are scattered across dozens of sites with their own quirks. FundFly indexes them all so you search once instead of a dozen times.",
    steps: [
      {
        title: "One unified index",
        desc: "Over a million opportunities from federal, state, and foundation sources are normalized into a single, consistent format you can scan in seconds.",
      },
      {
        title: "Filter by what matters",
        desc: "Narrow by opportunity type, agency, funding amount, deadline, and eligibility so only relevant programs surface.",
      },
      {
        title: "Save and revisit",
        desc: "Bookmark promising opportunities and keep them in one place while you decide where to apply.",
      },
    ],
    plan: "Free",
  },
  {
    slug: "ai-matching",
    icon: Brain,
    eyebrow: "Step 02 · Match",
    title: "AI Matching",
    tagline: "Your profile, scored against every opportunity.",
    intro:
      "Tell FundFly about your organization or yourself once. Our AI then scores every opportunity against your profile and explains, in plain language, why each one fits.",
    steps: [
      {
        title: "Build your profile",
        desc: "Add your organization details or personal background. The richer your profile, the sharper the matches.",
      },
      {
        title: "AI scores every fit",
        desc: "Each opportunity is scored 0–100 against your profile, with reasoning you can read so you trust the ranking.",
      },
      {
        title: "Focus on the winners",
        desc: "Spend your time on the handful of opportunities most likely to fund you, not the thousands that never could.",
      },
    ],
    plan: "AI Matching",
  },
  {
    slug: "apply-with-ai",
    icon: FileText,
    eyebrow: "Step 03 · Apply",
    title: "Apply with AI",
    tagline: "From requirements to submitted — with an AI agent doing the heavy lifting.",
    intro:
      "Applications are where most people give up. FundFly's browser agent researches exactly what a grant requires, builds you a checklist, completes what it can, lets you upload the rest, and — with your approval — submits on your behalf.",
    steps: [
      {
        title: "Research the requirements",
        desc: "The browser agent reads the full opportunity and compiles the complete list of required documents, eligibility rules, and submission steps.",
      },
      {
        title: "Build your checklist",
        desc: "Those requirements become a structured, step-by-step checklist tailored to that specific grant — nothing missed, nothing guessed.",
      },
      {
        title: "Let the agent knock it out",
        desc: "The agent drafts narratives, fills forms, and completes much of the checklist automatically, leaving you only the items that genuinely need you.",
      },
      {
        title: "Upload your documents",
        desc: "Attach every required document directly to its checklist item, so your full application lives in one organized place.",
      },
      {
        title: "Submit on your behalf",
        desc: "Once you approve, the agent navigates the grant portal and submits the application for you — with human-in-the-loop oversight at every step.",
      },
    ],
    plan: "Auto-Submission",
  },
  {
    slug: "application-tracker",
    icon: BarChart3,
    eyebrow: "Stay organized",
    title: "Application Tracker",
    tagline: "Every application, from draft to award.",
    intro:
      "Grant cycles are long and overlapping. The tracker keeps every application's status, deadlines, and notes in one view so nothing slips.",
    steps: [
      {
        title: "Track every stage",
        desc: "Follow each application from draft to submission to award, separated by business and personal so the two never tangle.",
      },
      {
        title: "Never miss a deadline",
        desc: "Deadlines stay front and center, so you always know what's closing next.",
      },
      {
        title: "Keep your notes attached",
        desc: "Store notes and context alongside each application instead of in scattered docs and inboxes.",
      },
    ],
    plan: "Free",
  },
  {
    slug: "security",
    icon: Shield,
    eyebrow: "Trust",
    title: "Secure & Private",
    tagline: "Your data stays yours.",
    intro:
      "Grant applications contain sensitive details about you and your organization. FundFly is built to protect them.",
    steps: [
      {
        title: "Encrypted end to end",
        desc: "Your data is encrypted in transit and at rest.",
      },
      {
        title: "Never sold",
        desc: "We don't sell your information to third parties — your profile exists to find you funding, nothing else.",
      },
      {
        title: "You stay in control",
        desc: "The AI agent operates with human-in-the-loop oversight, so nothing is submitted without your say-so.",
      },
    ],
    plan: "Free",
  },
  {
    slug: "instant-access",
    icon: Zap,
    eyebrow: "Get going fast",
    title: "Instant Access",
    tagline: "No downloads. No installs. Just sign up and search.",
    intro:
      "FundFly runs entirely in your browser. There's nothing to download and no credit card required to start.",
    steps: [
      {
        title: "Up and running in under a minute",
        desc: "Create a free account and start finding grants in your browser in under 60 seconds.",
      },
      {
        title: "Works everywhere",
        desc: "Any modern browser, any device — your account and saved opportunities follow you.",
      },
      {
        title: "Free to start",
        desc: "Browse, search, and save with no payment up front. Upgrade only when you're ready.",
      },
    ],
    plan: "Free",
  },
];

export function getFeature(slug: string): Feature | undefined {
  return FEATURES.find((f) => f.slug === slug);
}
