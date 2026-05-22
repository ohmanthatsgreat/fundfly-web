"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Zap,
  LayoutDashboard,
  Search,
  FileText,
  Beaker,
  Heart,
  User,
  UserCircle,
  Sparkles,
  Bookmark,
  ClipboardList,
  Archive,
  Rocket,
  PenTool,
} from "lucide-react";

type TourStep = {
  target: string;
  title: string;
  description: string;
  icon: React.ElementType;
  position: "right" | "bottom" | "center";
  route?: string;
};

const TOUR_STEPS: TourStep[] = [
  {
    target: "welcome",
    title: "Welcome to FundFly",
    description:
      "FundFly aggregates government grants, SBIR funding, and more into one dashboard. Let's walk through how everything works.",
    icon: Zap,
    position: "center",
  },
  {
    target: "nav-all",
    title: "1. Browse All Opportunities",
    description:
      "Your main feed. Every opportunity from every source in one place, sorted by deadline. Use search and filters to narrow down by keyword, funding amount, or agency.",
    icon: LayoutDashboard,
    position: "right",
    route: "/app",
  },
  {
    target: "nav-biz-grants",
    title: "2. Business Grants",
    description:
      "Government grants and foundation funding for organizations. Includes federal programs from Grants.gov.",
    icon: FileText,
    position: "right",
    route: "/app/biz-grants",
  },
  {
    target: "nav-sbir",
    title: "3. SBIR / STTR",
    description:
      "Small Business Innovation Research and Technology Transfer programs. Federal R&D funding for innovative small businesses.",
    icon: Beaker,
    position: "right",
    route: "/app/sbir",
  },
  {
    target: "nav-personal",
    title: "4. Personal Grants",
    description:
      "Scholarships, fellowships, and personal funding. Matched based on your Personal Profile.",
    icon: Heart,
    position: "right",
    route: "/app/personal",
  },
  {
    target: "nav-organization",
    title: "5. Organization Profile",
    description:
      "Enter your org details — name, EIN, UEI, mission, and focus areas. This powers AI matching and auto-fills application sections.",
    icon: User,
    position: "right",
    route: "/app/organization",
  },
  {
    target: "nav-personal-profile",
    title: "6. Personal Profile",
    description:
      "Your individual profile for scholarship and personal grant matching. Add your background, education, and interests.",
    icon: UserCircle,
    position: "right",
    route: "/app/personal-profile",
  },
  {
    target: "nav-matches",
    title: "7. AI Matches",
    description:
      "Once your profile is set up, run AI matching. Claude analyzes every opportunity against your profile and scores them.",
    icon: Sparkles,
    position: "right",
    route: "/app/matches",
  },
  {
    target: "nav-saved",
    title: "8. Saved Opportunities",
    description:
      "Bookmark any opportunity to save it here. Use this as your shortlist of grants you're considering.",
    icon: Bookmark,
    position: "right",
    route: "/app/saved",
  },
  {
    target: "nav-applications",
    title: "9. Application Tracker",
    description:
      'Track every application from draft through submission. Click "Track Application" on any opportunity to start, then open the workspace to build your application with AI.',
    icon: ClipboardList,
    position: "right",
    route: "/app/applications",
  },
  {
    target: "nav-applications",
    title: "10. AI Application Writer",
    description:
      'Inside the workspace, click "Generate Application with AI" and Claude writes all sections — narrative, budget, capability, and more — tailored to the opportunity and your profile.',
    icon: PenTool,
    position: "right",
  },
  {
    target: "nav-archive",
    title: "11. Archive",
    description:
      "Dismissed opportunities and expired deadlines land here. Restore anything if you change your mind.",
    icon: Archive,
    position: "right",
    route: "/app/archive",
  },
  {
    target: "finish",
    title: "You're all set!",
    description:
      "Recommended workflow: Set up your profile → browse opportunities → run AI matching → save the best fits → start applications → let AI write your sections. You can restart this tour anytime from Settings.",
    icon: Rocket,
    position: "center",
  },
];

export default function GuidedTour({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [spotlightStyle, setSpotlightStyle] = useState<React.CSSProperties>(
    {}
  );
  const [showSpotlight, setShowSpotlight] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = TOUR_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  const positionTooltip = useCallback(() => {
    if (step.position === "center") {
      setShowSpotlight(false);
      setTooltipStyle({
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      });
      return;
    }

    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      setShowSpotlight(false);
      setTooltipStyle({
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      });
      return;
    }

    const rect = el.getBoundingClientRect();
    const padding = 6;

    setShowSpotlight(true);
    setSpotlightStyle({
      position: "fixed",
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
      borderRadius: "10px",
    });

    if (step.position === "right") {
      setTooltipStyle({
        position: "fixed",
        top: Math.max(16, Math.min(rect.top, window.innerHeight - 300)),
        left: rect.right + 16,
      });
    } else if (step.position === "bottom") {
      setTooltipStyle({
        position: "fixed",
        top: rect.bottom + 16,
        left: Math.max(16, rect.left),
      });
    }
  }, [step]);

  useEffect(() => {
    if (step.route) {
      router.push(step.route);
    }
    const timer = setTimeout(positionTooltip, 150);
    return () => clearTimeout(timer);
  }, [currentStep, step, positionTooltip, router]);

  useEffect(() => {
    window.addEventListener("resize", positionTooltip);
    return () => window.removeEventListener("resize", positionTooltip);
  }, [positionTooltip]);

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem("fundfly_tour_completed", "true");
      onClose();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirst) setCurrentStep((s) => s - 1);
  };

  const handleSkip = () => {
    localStorage.setItem("fundfly_tour_completed", "true");
    onClose();
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") handleNext();
      else if (e.key === "ArrowLeft") handlePrev();
      else if (e.key === "Escape") handleSkip();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  const Icon = step.icon;

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 transition-opacity duration-300"
        onClick={handleSkip}
      />

      {/* Spotlight cutout */}
      {showSpotlight && (
        <div
          className="absolute border-2 border-accent/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] transition-all duration-300 ease-out"
          style={spotlightStyle}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="z-[10000] w-[380px] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        style={tooltipStyle}
      >
        {/* Progress bar */}
        <div className="h-1 bg-surface">
          <div
            className="h-full bg-gradient-to-r from-accent to-purple-500 transition-all duration-500"
            style={{
              width: `${((currentStep + 1) / TOUR_STEPS.length) * 100}%`,
            }}
          />
        </div>

        <div className="p-5 space-y-3">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
              <Icon size={18} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Step {currentStep + 1} of {TOUR_STEPS.length}
              </p>
            </div>
            <button
              onClick={handleSkip}
              className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <p className="text-[13px] text-foreground/70 leading-relaxed">
            {step.description}
          </p>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={handleSkip}
              className="text-xs text-muted hover:text-foreground transition-colors"
            >
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  onClick={handlePrev}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground border border-border rounded-lg hover:bg-surface transition-all"
                >
                  <ChevronLeft size={14} />
                  Back
                </button>
              )}
              <button
                onClick={handleNext}
                className="flex items-center gap-1 px-4 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-accent to-purple-500 rounded-lg hover:opacity-90 transition-all"
              >
                {isLast ? "Get Started" : "Next"}
                {!isLast && <ChevronRight size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
