"use client";

import { useState, useEffect } from "react";
import GuidedTour from "./GuidedTour";

export default function TourProvider() {
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    // Show tour on first visit
    const completed = localStorage.getItem("fundfly_tour_completed");
    if (!completed) {
      // Small delay so the page finishes rendering
      const timer = setTimeout(() => setShowTour(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Listen for manual trigger from settings
  useEffect(() => {
    const handler = () => setShowTour(true);
    window.addEventListener("fundfly:start-tour", handler);
    return () => window.removeEventListener("fundfly:start-tour", handler);
  }, []);

  if (!showTour) return null;

  return <GuidedTour onClose={() => setShowTour(false)} />;
}
