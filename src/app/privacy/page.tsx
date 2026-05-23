import type { Metadata } from "next";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "FundFly privacy policy — how we collect, use, and protect your data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <MarketingHeader />
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted mb-10">Last updated: May 22, 2026</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground/80 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              1. Information We Collect
            </h2>
            <p>
              <strong>Account information.</strong> When you create a FundFly
              account, we collect your name, email address, and authentication
              credentials through our authentication provider (Clerk).
            </p>
            <p className="mt-2">
              <strong>Organization & profile data.</strong> Information you
              provide about your organization or personal background to enable
              AI matching — such as business type, industry, location, revenue,
              and areas of interest.
            </p>
            <p className="mt-2">
              <strong>Usage data.</strong> We collect information about how you
              interact with FundFly, including pages visited, features used,
              opportunities saved, and applications created.
            </p>
            <p className="mt-2">
              <strong>Payment information.</strong> Payment processing is handled
              entirely by Stripe. We do not store credit card numbers, bank
              account details, or other financial information on our servers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              2. How We Use Your Information
            </h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Provide and improve FundFly services</li>
              <li>
                Match you with relevant grant and funding opportunities using AI
              </li>
              <li>Generate application drafts tailored to your profile</li>
              <li>Process payments and manage subscriptions</li>
              <li>Send service-related communications</li>
              <li>Detect and prevent fraud or abuse</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              3. AI & Data Processing
            </h2>
            <p>
              FundFly uses AI (powered by Anthropic&apos;s Claude) to score
              opportunities against your profile and generate application
              content. Your profile data and opportunity details are sent to the
              AI provider for processing. We do not use your data to train AI
              models. AI-generated content is stored in your account and is not
              shared with other users.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              4. Data Sharing
            </h2>
            <p>We do not sell your personal information. We share data only with:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>
                <strong>Service providers</strong> — Clerk (authentication),
                Stripe (payments), Anthropic (AI processing), Neon (database
                hosting), and Vercel (application hosting)
              </li>
              <li>
                <strong>Legal requirements</strong> — When required by law,
                subpoena, or to protect our rights
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              5. Data Security
            </h2>
            <p>
              We use industry-standard security measures including encrypted
              connections (TLS), secure authentication, and access controls. All
              data is stored in encrypted databases. However, no method of
              transmission over the internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              6. Data Retention
            </h2>
            <p>
              We retain your data for as long as your account is active. If you
              delete your account, we will remove your personal data within 30
              days, except where we are required to retain it for legal or
              compliance purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              7. Your Rights
            </h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and data</li>
              <li>Export your data in a portable format</li>
              <li>Opt out of non-essential communications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              8. Cookies
            </h2>
            <p>
              FundFly uses essential cookies for authentication and session
              management. We do not use advertising or tracking cookies. Our
              analytics are privacy-focused and do not track individual users
              across sites.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              9. Children&apos;s Privacy
            </h2>
            <p>
              FundFly is not intended for use by individuals under 13 years of
              age. We do not knowingly collect information from children.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              10. Changes to This Policy
            </h2>
            <p>
              We may update this policy from time to time. We will notify you of
              material changes by email or through a notice on our website.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              Contact
            </h2>
            <p>
              If you have questions about this privacy policy, contact us at{" "}
              <a
                href="mailto:support@fundfly.app"
                className="text-accent hover:underline"
              >
                support@fundfly.app
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
