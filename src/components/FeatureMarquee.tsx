type Pill = {
  title: string;
  desc: string;
};

const PILLS: Pill[] = [
  { title: "Search 1M+ grants", desc: "One index for Grants.gov, SBIR & foundations" },
  { title: "AI match scoring", desc: "Every grant ranked 0–100 for your profile" },
  { title: "Pre-submission checklist", desc: "AI lists every required document & step" },
  { title: "Per-step document uploads", desc: "Attach each file right to its checklist item" },
  { title: "AI application drafting", desc: "Narratives written, exported to DOCX" },
  { title: "Agent auto-submit", desc: "Files through grant portals on your behalf" },
  { title: "Closing-this-week view", desc: "Spot every grant due in the next 7 days" },
  { title: "Application tracker", desc: "Follow each grant from draft to awarded" },
];

/**
 * Full-width row of large feature pills that scrolls horizontally on a seamless
 * loop. The list is duplicated so the CSS marquee (translateX -50%) wraps with
 * no visible seam. Restrained single-accent styling (no icons). Animation is
 * disabled under prefers-reduced-motion (see globals.css).
 */
export default function FeatureMarquee() {
  return (
    <div className="marquee-mask relative w-full overflow-hidden py-2">
      <div className="flex w-max animate-marquee gap-4">
        {[...PILLS, ...PILLS].map((p, i) => (
          <div
            key={i}
            className="flex items-center gap-3 whitespace-nowrap rounded-lg border border-border bg-card px-6 py-4 shadow-sm"
          >
            <span className="h-8 w-[3px] shrink-0 rounded-full bg-accent" />
            <div>
              <div className="text-[15px] md:text-base font-semibold tracking-tight text-foreground">
                {p.title}
              </div>
              <div className="text-[13px] text-muted mt-0.5">{p.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
