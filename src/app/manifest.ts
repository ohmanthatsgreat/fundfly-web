import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FundFly",
    short_name: "FundFly",
    description:
      "AI-powered grant discovery and application platform. Find and apply to grants, SBIR funding, and foundation programs.",
    start_url: "/app",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4361ee",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "256x256",
        type: "image/x-icon",
      },
    ],
  };
}
