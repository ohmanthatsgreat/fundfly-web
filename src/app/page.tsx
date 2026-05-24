import Link from "next/link";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import {
  Search,
  Brain,
  FileText,
  Shield,
  Zap,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  Monitor,
  Globe,
} from "lucide-react";

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
    description: "Free tier with 1,000,000+ searchable grant opportunities",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    ratingCount: "120",
  },
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingHeader />

      <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-light text-accent text-sm font-medium mb-8">
            <Zap className="w-3.5 h-3.5" />
            1M+ opportunities indexed
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
            There are billions in
            <br />
            grants waiting.
            <br />
            <span className="text-accent">We find yours.</span>
          </h1>

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
      </section>

      {/* Stats bar */}
      <section className="bg-foreground text-background py-16">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-4xl font-bold">$500B+</div>
            <div className="text-sm opacity-60 mt-1">In federal grants awarded annually</div>
          </div>
          <div>
            <div className="text-4xl font-bold">1M+</div>
            <div className="text-sm opacity-60 mt-1">Opportunities indexed and searchable</div>
          </div>
          <div>
            <div className="text-4xl font-bold">98%</div>
            <div className="text-sm opacity-60 mt-1">AI match accuracy for eligible opportunities</div>
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
                icon: Search,
                title: "Browse & Search",
                desc: "Over 1 million grants from Grants.gov, SBIR.gov, state portals, and foundation databases. Filter by type, agency, funding amount, deadline, and eligibility.",
              },
              {
                step: "02",
                icon: Brain,
                title: "AI Matching",
                desc: "Tell us about your organization or yourself. Our AI scores every opportunity against your profile and explains why each is a fit.",
              },
              {
                step: "03",
                icon: FileText,
                title: "Apply with AI",
                desc: "AI drafts your application narrative, generates required documents, and can even fill out submission forms for you.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="relative bg-card border border-border rounded-2xl p-8 hover:shadow-lg transition-shadow"
              >
                <div className="text-accent/20 text-6xl font-bold absolute top-4 right-6">
                  {item.step}
                </div>
                <item.icon className="w-10 h-10 text-accent mb-5" />
                <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{item.desc}</p>
              </div>
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
            <div className="bg-card border border-border rounded-2xl p-8">
              <Monitor className="w-10 h-10 text-accent mb-5" />
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
            </div>

            <div className="bg-card border border-border rounded-2xl p-8">
              <Globe className="w-10 h-10 text-accent mb-5" />
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
            </div>
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
                icon: Search,
                title: "Smart Search",
                desc: "Full-text search across 1M+ opportunities with filters for type, agency, amount, and deadline.",
              },
              {
                icon: Brain,
                title: "AI Match Scoring",
                desc: "Every opportunity scored 0-100 against your profile with detailed reasoning.",
              },
              {
                icon: FileText,
                title: "Application Drafting",
                desc: "AI generates project narratives, budgets, and capability statements.",
              },
              {
                icon: BarChart3,
                title: "Application Tracker",
                desc: "Track every application from draft to submission to award.",
              },
              {
                icon: Shield,
                title: "Secure & Private",
                desc: "Your data stays yours. Bank-grade encryption, no data selling.",
              },
              {
                icon: Zap,
                title: "Instant Access",
                desc: "No downloads or installs. Sign up and start finding grants in your browser in under 60 seconds.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-card border border-border rounded-xl p-6 hover:shadow-md transition-shadow"
              >
                <item.icon className="w-8 h-8 text-accent mb-4" />
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-gradient-to-br from-accent to-blue-700">
        <div className="max-w-3xl mx-auto px-6 text-center text-white">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Your next grant is waiting.
          </h2>
          <p className="text-lg opacity-80 mb-10">
            Join thousands of founders, artists, and individuals who bypassed
            the bureaucracy and secured their funding.
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
