import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { FEATURES, getFeature } from "../featureData";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return FEATURES.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const feature = getFeature(slug);

  if (!feature) {
    return { title: "Feature Not Found" };
  }

  return {
    title: `${feature.title} — FundFly`,
    description: feature.tagline,
    alternates: { canonical: `/features/${feature.slug}` },
    openGraph: {
      type: "website",
      title: `${feature.title} — FundFly`,
      description: feature.tagline,
      url: `https://fundfly.app/features/${feature.slug}`,
    },
  };
}

export default async function FeaturePage({ params }: Props) {
  const { slug } = await params;
  const feature = getFeature(slug);

  if (!feature) notFound();

  const Icon = feature.icon;
  const otherFeatures = FEATURES.filter((f) => f.slug !== feature.slug).slice(0, 3);

  return (
    <>
      <MarketingHeader />

      <main>
        {/* Hero */}
        <section className="border-b border-border">
          <div className="max-w-3xl mx-auto px-6 pt-16 pb-12">
            <nav className="flex items-center gap-2 text-sm text-muted mb-8">
              <Link href="/#how-it-works" className="hover:text-foreground transition-colors">
                Features
              </Link>
              <span>/</span>
              <span className="text-foreground">{feature.title}</span>
            </nav>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-light text-accent text-xs font-medium mb-6">
              {feature.eyebrow}
            </div>

            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                <Icon className="w-6 h-6 text-accent" />
              </div>
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight">
                {feature.title}
              </h1>
            </div>

            <p className="text-xl text-accent font-medium mb-4">{feature.tagline}</p>
            <p className="text-lg text-muted leading-relaxed">{feature.intro}</p>
          </div>
        </section>

        {/* Steps */}
        <section className="py-16">
          <div className="max-w-3xl mx-auto px-6">
            <div className="space-y-6">
              {feature.steps.map((step, i) => (
                <div
                  key={step.title}
                  className="flex gap-5 bg-card border border-border rounded-2xl p-6"
                >
                  <div className="w-9 h-9 rounded-full bg-accent/10 text-accent font-semibold flex items-center justify-center shrink-0">
                    {i + 1}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold mb-1.5">{step.title}</h2>
                    <p className="text-muted text-sm leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="mt-12 bg-surface border border-border rounded-2xl p-8 text-center">
              <p className="text-sm text-muted mb-1">
                {feature.plan && feature.plan !== "Free"
                  ? `Included with the ${feature.plan} plan`
                  : "Included free"}
              </p>
              <h3 className="text-2xl font-bold mb-5">Ready to try it?</h3>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/sign-up"
                  className="bg-accent text-white px-7 py-3 rounded-xl text-sm font-medium hover:bg-accent/90 transition-colors inline-flex items-center gap-2"
                >
                  Start Free
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/pricing"
                  className="px-7 py-3 rounded-xl text-sm font-medium border border-border hover:bg-card transition-colors"
                >
                  See pricing
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Explore other features */}
        <section className="py-16 bg-surface border-t border-border">
          <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-xl font-bold mb-6">Explore more</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {otherFeatures.map((f) => {
                const FIcon = f.icon;
                return (
                  <Link
                    key={f.slug}
                    href={`/features/${f.slug}`}
                    className="group bg-card border border-border rounded-xl p-6 hover:border-accent/30 transition-colors"
                  >
                    <FIcon className="w-7 h-7 text-accent mb-3" />
                    <h3 className="font-semibold mb-1 group-hover:text-accent transition-colors">
                      {f.title}
                    </h3>
                    <p className="text-sm text-muted leading-relaxed line-clamp-2">
                      {f.tagline}
                    </p>
                    <span className="inline-flex items-center gap-1 text-sm text-accent mt-3">
                      Learn more
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
