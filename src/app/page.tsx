import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import FeatureMarquee from "@/components/FeatureMarquee";
import ClothBackground from "@/components/ClothBackground";
import HeroHeadline from "@/components/HeroHeadline";
import DataSourceWatermark from "@/components/DataSourceWatermark";
import { SmallBusinessArt, IndividualsArt } from "@/components/AudienceArt";
import CardArt, { CardArtWatermark, TierBars } from "@/components/CardArt";
import { ArrowRight, CheckCircle2, ChevronDown } from "lucide-react";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "FundFly",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://fundfly.app",
  description:
    "AI-powered grant discovery and application platform. Find and apply to grants, SBIR funding, and foundation programs.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free tier with searchable grant opportunities",
  },
};

// FAQ content. Rendered as a native <details> accordion (no client JS) and
// emitted as FAQPage JSON-LD from the same source — the single highest-ROI
// schema for both Google rich results and LLM answer extraction.
const faqs: { q: string; a: string }[] = [
  {
    q: "What is FundFly?",
    a: "FundFly is an AI-powered platform that helps you find and apply for funding. It indexes over a million grants, SBIR/STTR programs, and foundation opportunities, then uses AI to score each one against your profile so you can focus on the ones that actually fit.",
  },
  {
    q: "Is FundFly free?",
    a: "Yes. The free tier lets you browse over a million opportunities, search and filter them, save the promising ones, and track your applications — no credit card required. Paid tiers add AI match scoring, application checklists, and automated submission.",
  },
  {
    q: "Who is FundFly for?",
    a: "Small businesses, startups, nonprofits, researchers, and individuals. Companies use it for business grants and SBIR/STTR funding, while individuals use it for personal and foundation grants.",
  },
  {
    q: "How does AI matching work?",
    a: "You build an organization or personal profile once. FundFly's AI then scores every opportunity from 0 to 100 against that profile and explains, in plain language, why each one fits — so you spend time on the handful most likely to fund you.",
  },
  {
    q: "Where does FundFly get its grant data?",
    a: "FundFly aggregates federal, state, and foundation sources — including Grants.gov, SBIR/STTR programs, and foundation databases — and normalizes them into one consistent, searchable index.",
  },
  {
    q: "How much does FundFly cost?",
    a: "Browsing is free. Paid plans are AI Matching at $29/mo, Pre-Submission Checklist at $129/mo, and Auto-Submission at $399/mo. Every paid plan includes a 3-day free trial with no credit card and a 14-day money-back guarantee.",
  },
  {
    q: "Can FundFly submit applications for me?",
    a: "On the Auto-Submission plan, an AI agent navigates grant portals, fills out forms, and submits applications on your behalf — with human-in-the-loop review and your approval at every step.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/app");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <MarketingHeader />

      <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 pt-16 pb-12 text-center">
          <HeroHeadline />

          <p className="text-lg md:text-xl text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
            Governments and foundations want to give their money away. But
            fragmented databases and opaque 40-page applications keep normal
            people out. FundFly fixes the access problem.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="bg-accent text-white px-8 py-3.5 rounded-xl text-base font-medium hover:bg-accent/90 transition-all shadow-lg shadow-accent/20"
            >
              Start Finding Grants — Free
            </Link>
            <Link
              href="/#how-it-works"
              className="px-8 py-3.5 rounded-xl text-base font-medium border border-border hover:bg-surface transition-colors"
            >
              See How It Works
            </Link>
          </div>
        </div>

        {/* Scrolling feature pills */}
        <div className="pb-16">
          <FeatureMarquee />
        </div>
      </section>

      {/* Stats bar */}
      <section className="relative overflow-hidden bg-foreground text-background py-16">
        <ClothBackground />
        <DataSourceWatermark />
        {/* Center fade so the watermark recedes behind the stat numbers */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 58% 48% at 50% 50%, var(--color-foreground) 0%, transparent 70%)",
          }}
        />
        <div className="relative z-10 max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-4xl font-bold">$500B+</div>
            <div className="text-sm opacity-60 mt-1">In federal grants awarded annually</div>
          </div>
          <div>
            <div className="text-4xl font-bold">1M+</div>
            <div className="text-sm opacity-60 mt-1">Opportunities indexed and searchable</div>
          </div>
          <div>
            <div className="text-4xl font-bold">50+</div>
            <div className="text-sm opacity-60 mt-1">Federal, state & foundation data sources</div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Three steps to funding
            </h2>
            <p className="text-muted text-lg max-w-xl mx-auto">
              Stop searching a dozen government websites. FundFly brings
              everything to one place.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                slug: "browse-search",
                art: "search" as const,
                title: "Browse & Search",
                desc: "Grants from Grants.gov, SBIR.gov, state portals, and foundation databases — all in one place. Filter by type, agency, funding amount, deadline, and eligibility.",
              },
              {
                step: "02",
                slug: "ai-matching",
                art: "match" as const,
                title: "AI Matching",
                desc: "Tell us about your organization or yourself. Our AI scores every opportunity against your profile and explains why each is a fit.",
              },
              {
                step: "03",
                slug: "apply-with-ai",
                art: "draft" as const,
                title: "Apply with AI",
                desc: "AI drafts your application narrative, generates required documents, and can even fill out submission forms for you.",
              },
            ].map((item) => (
              <Link
                key={item.step}
                href={`/features/${item.slug}`}
                className="group relative bg-card border border-border rounded-2xl p-8 hover:shadow-lg hover:border-accent/30 transition-all"
              >
                <div className="text-accent/20 text-6xl font-bold absolute top-4 right-6">
                  {item.step}
                </div>
                <CardArt variant={item.art} className="mb-5" />
                <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                <p className="text-muted text-sm leading-relaxed mb-4">{item.desc}</p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-accent">
                  Learn more
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Two audiences */}
      <section className="py-24 bg-surface">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Funding for every journey
            </h2>
            <p className="text-muted text-lg max-w-xl mx-auto">
              Whether you&apos;re scaling a company or funding your education,
              FundFly finds the capital designed for you.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <Link
              href="/sign-up"
              className="group bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg hover:border-accent/30 transition-all"
            >
              <div className="relative h-44 bg-gradient-to-br from-blue-800 to-slate-900 overflow-hidden">
                <SmallBusinessArt />
                <span className="absolute bottom-4 left-6 text-white text-sm font-medium tracking-wide">
                  For founders & teams
                </span>
              </div>
              <div className="p-8">
                <h3 className="text-xl font-semibold mb-3">Small Business</h3>
                <p className="text-muted text-sm leading-relaxed mb-6">
                  Discover small business grants, startup funding, and corporate
                  programs designed to help founders scale without giving up
                  equity.
                </p>
                <ul className="space-y-3">
                  {[
                    "Federal SBIR/STTR Funding",
                    "State & Local Economic Relief",
                    "Foundation Mission Grants",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm">
                      <CheckCircle2 className="w-4.5 h-4.5 text-accent shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-accent mt-6">
                  Find business funding
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </Link>

            <Link
              href="/sign-up"
              className="group bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg hover:border-accent/30 transition-all"
            >
              <div className="relative h-44 bg-gradient-to-br from-slate-800 to-blue-900 overflow-hidden">
                <IndividualsArt />
                <span className="absolute bottom-4 left-6 text-white text-sm font-medium tracking-wide">
                  For people & researchers
                </span>
              </div>
              <div className="p-8">
                <h3 className="text-xl font-semibold mb-3">Individuals</h3>
                <p className="text-muted text-sm leading-relaxed mb-6">
                  Find personal grants for research, arts, education, housing
                  assistance, and emergency relief. We bring the applications to
                  you.
                </p>
                <ul className="space-y-3">
                  {[
                    "Academic Fellowships",
                    "Artist & Creator Endowments",
                    "Targeted Demographic Funds",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm">
                      <CheckCircle2 className="w-4.5 h-4.5 text-accent shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-accent mt-6">
                  Find personal funding
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything you need to win funding
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                slug: "browse-search",
                art: "search" as const,
                title: "Smart Search",
                desc: "Full-text search across every indexed opportunity with filters for type, agency, amount, and deadline.",
              },
              {
                slug: "ai-matching",
                art: "match" as const,
                title: "AI Match Scoring",
                desc: "Every opportunity scored 0-100 against your profile with detailed reasoning.",
              },
              {
                slug: "apply-with-ai",
                art: "draft" as const,
                title: "Application Drafting",
                desc: "AI generates project narratives, budgets, and capability statements.",
              },
              {
                slug: "application-tracker",
                art: "tracker" as const,
                title: "Application Tracker",
                desc: "Track every application from draft to submission to award.",
              },
              {
                slug: "security",
                art: "secure" as const,
                title: "Secure & Private",
                desc: "Your data stays yours. Encrypted in transit and at rest, never sold to third parties.",
              },
              {
                slug: "instant-access",
                art: "instant" as const,
                title: "Instant Access",
                desc: "No downloads or installs. Sign up and start finding grants in your browser in under 60 seconds.",
              },
            ].map((item) => (
              <Link
                key={item.title}
                href={`/features/${item.slug}`}
                className="group relative overflow-hidden bg-card border border-border rounded-xl p-6 hover:shadow-md hover:border-accent/30 transition-all"
              >
                <CardArtWatermark variant={item.art} />
                <div className="relative">
                  <CardArt variant={item.art} className="mb-4" />
                  <h3 className="font-semibold mb-2 group-hover:text-accent transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted leading-relaxed">{item.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="py-24 bg-surface">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Start free, upgrade when you&apos;re ready
            </h2>
            <p className="text-muted text-lg max-w-xl mx-auto">
              Each tier includes everything below it. No hidden fees.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-4 text-center">
            {[
              { name: "Free", price: "$0 forever", desc: "Browse, search & save grants", popular: false, level: 1 },
              { name: "Matching", price: "$29/mo", desc: "AI scores every grant against your profile", popular: false, level: 2 },
              { name: "Checklist", price: "$129/mo", desc: "Step-by-step plans & AI drafting", popular: true, level: 3 },
              { name: "Auto-Submit", price: "$399/mo", desc: "AI agent fills & submits for you", popular: false, level: 4 },
            ].map((tier) => (
              <Link
                key={tier.name}
                href="/pricing"
                className={`group bg-card rounded-xl p-6 transition-all hover:shadow-md ${
                  tier.popular
                    ? "border-2 border-accent shadow-md shadow-accent/10"
                    : "border border-border hover:border-accent/30"
                }`}
              >
                <TierBars level={tier.level} className="mb-4" />
                <div className="text-2xl font-bold mb-1">{tier.name}</div>
                <div className="text-sm text-muted mb-3">{tier.price}</div>
                <p className="text-xs text-muted mb-4">{tier.desc}</p>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                  View plan
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </Link>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link
              href="/pricing"
              className="text-accent text-sm font-medium hover:underline inline-flex items-center gap-1"
            >
              See full plan details
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Frequently asked questions
            </h2>
            <p className="text-muted text-lg">
              Everything you need to know about finding and winning funding with
              FundFly.
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq) => (
              <details
                key={faq.q}
                className="group bg-card border border-border rounded-xl px-5 open:border-accent/30 transition-colors"
              >
                <summary className="flex items-center justify-between gap-4 py-4 cursor-pointer list-none font-medium">
                  {faq.q}
                  <ChevronDown className="w-4 h-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <p className="text-sm text-muted leading-relaxed pb-4">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-gradient-to-br from-accent to-blue-700">
        <div className="max-w-3xl mx-auto px-6 text-center text-white">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Grants expire daily. Don&apos;t miss yours.
          </h2>
          <p className="text-lg opacity-80 mb-10">
            Built for nonprofits, founders, artists, and individuals
            who&apos;d rather write grants than search for them.
          </p>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 bg-white text-accent px-8 py-3.5 rounded-xl text-base font-medium hover:bg-white/90 transition-colors"
          >
            Get Started Free
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-sm opacity-60 mt-4">
            No credit card required. Start finding funding in minutes.
          </p>
        </div>
      </section>
      </main>

      <Footer />
    </>
  );
}
