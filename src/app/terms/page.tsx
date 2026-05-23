import type { Metadata } from "next";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "FundFly terms of service — rules and guidelines for using our platform.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <>
      <MarketingHeader />
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted mb-10">Last updated: May 22, 2026</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground/80 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using FundFly (&quot;the Service&quot;), you agree
              to be bound by these Terms of Service. If you do not agree to
              these terms, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              2. Description of Service
            </h2>
            <p>
              FundFly is an AI-powered platform that helps users discover grant
              and funding opportunities, match them against user profiles, and
              generate application materials. FundFly aggregates publicly
              available data from government sources including Grants.gov,
              SBIR.gov, and state grant portals.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              3. Accounts
            </h2>
            <p>
              You must create an account to access certain features of the
              Service. You are responsible for maintaining the security of your
              account credentials and for all activity that occurs under your
              account. You must be at least 13 years old to create an account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              4. Subscriptions & Payments
            </h2>
            <p>
              FundFly offers free and paid subscription tiers. Paid
              subscriptions are billed through Stripe on a recurring basis.
              You may cancel at any time from your account settings. Refunds
              are handled on a case-by-case basis — contact us within 7 days
              of a charge for assistance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              5. AI-Generated Content
            </h2>
            <p>
              FundFly uses AI to generate application content, match scores,
              and submission plans. AI-generated content is provided as a
              starting point and should be reviewed, edited, and verified by
              you before submission to any grant program.
            </p>
            <p className="mt-2">
              <strong>
                FundFly does not guarantee the accuracy, completeness, or
                suitability of AI-generated content.
              </strong>{" "}
              You are solely responsible for the content of any application you
              submit.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              6. Data Accuracy
            </h2>
            <p>
              FundFly aggregates grant data from public government sources. While
              we strive to keep information current and accurate, we cannot
              guarantee the accuracy, completeness, or timeliness of any
              opportunity listing. Always verify deadlines, eligibility, and
              requirements directly with the issuing agency.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              7. Acceptable Use
            </h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Use the Service for any unlawful purpose</li>
              <li>Submit false or misleading information in grant applications</li>
              <li>
                Attempt to access other users&apos; accounts or data
              </li>
              <li>
                Scrape, crawl, or use automated means to extract data from the
                Service beyond normal use
              </li>
              <li>
                Resell, redistribute, or commercialize data obtained from the
                Service
              </li>
              <li>
                Interfere with or disrupt the Service or its infrastructure
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              8. Intellectual Property
            </h2>
            <p>
              FundFly and its original content, features, and functionality are
              owned by FundFly and protected by applicable intellectual property
              laws. AI-generated application content created through your
              account belongs to you.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              9. Limitation of Liability
            </h2>
            <p>
              FundFly is provided &quot;as is&quot; without warranties of any
              kind. We are not liable for any indirect, incidental, special,
              consequential, or punitive damages, including but not limited to
              loss of funding, missed deadlines, or rejected applications. Our
              total liability is limited to the amount you paid for the Service
              in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              10. Termination
            </h2>
            <p>
              We may suspend or terminate your access to the Service at any time
              for violation of these terms or for any reason with reasonable
              notice. You may terminate your account at any time by contacting us
              or through your account settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              11. Changes to Terms
            </h2>
            <p>
              We reserve the right to modify these terms at any time. We will
              notify you of material changes via email or through a notice on
              the Service. Continued use of the Service after changes
              constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              12. Governing Law
            </h2>
            <p>
              These terms are governed by and construed in accordance with the
              laws of the United States. Any disputes shall be resolved in the
              courts of the applicable jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              Contact
            </h2>
            <p>
              If you have questions about these terms, contact us at{" "}
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
