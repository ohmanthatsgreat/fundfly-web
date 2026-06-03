import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-surface border-t border-border mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="FundFly" className="h-8 w-auto" width={48} height={32} />
              <span className="font-semibold text-lg">FundFly</span>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              Democratizing access to capital by dismantling the bureaucratic
              barriers to grant funding.
            </p>
          </div>

          <div>
            <h4 className="font-medium text-sm mb-4">Company</h4>
            <ul className="space-y-2.5 text-sm text-muted">
              <li><Link href="/#how-it-works" className="hover:text-foreground transition-colors">How it Works</Link></li>
              <li><Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link></li>
              <li><Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-sm mb-4">Legal</h4>
            <ul className="space-y-2.5 text-sm text-muted">
              <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border space-y-3 text-center">
          <p className="text-xs text-muted leading-relaxed max-w-3xl mx-auto">
            <strong className="text-foreground/70">Disclaimer:</strong> FundFly
            is a grant discovery and application-drafting tool. We are not
            affiliated with any government agency or foundation. FundFly does
            not provide legal, tax, financial, or grant-writing professional
            advice. Verify all eligibility requirements, deadlines, and
            submission instructions directly with the funder before applying.
            Always consult qualified professionals for legal, tax, or
            financial decisions related to grant funding.
          </p>
          <p className="text-sm text-muted">
            &copy; {new Date().getFullYear()} FundFly. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
