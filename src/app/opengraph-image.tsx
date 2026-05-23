import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "FundFly — AI-powered grant discovery and application platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #6366f1 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          padding: "60px",
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "28px",
              fontWeight: 800,
            }}
          >
            FF
          </div>
          <span
            style={{
              color: "white",
              fontSize: "40px",
              fontWeight: 700,
              letterSpacing: "-0.5px",
            }}
          >
            FundFly
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            color: "white",
            fontSize: "56px",
            fontWeight: 800,
            textAlign: "center",
            lineHeight: 1.15,
            maxWidth: "900px",
            marginBottom: "24px",
          }}
        >
          AI-Powered Grant Discovery & Applications
        </div>

        {/* Subtitle */}
        <div
          style={{
            color: "rgba(255,255,255,0.8)",
            fontSize: "24px",
            textAlign: "center",
            maxWidth: "700px",
            lineHeight: 1.4,
            marginBottom: "40px",
          }}
        >
          30,000+ opportunities from Grants.gov, SBIR.gov, and state portals.
          AI matching, application drafting, and automated submissions.
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            gap: "48px",
          }}
        >
          {[
            { value: "$500B+", label: "Federal grants/year" },
            { value: "30K+", label: "Opportunities" },
            { value: "98%", label: "Match accuracy" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  color: "white",
                  fontSize: "32px",
                  fontWeight: 800,
                }}
              >
                {stat.value}
              </span>
              <span
                style={{
                  color: "rgba(255,255,255,0.6)",
                  fontSize: "14px",
                  marginTop: "4px",
                }}
              >
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
