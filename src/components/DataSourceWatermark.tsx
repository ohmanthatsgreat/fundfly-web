/**
 * Faint watermark wall of the funding sources represented in the catalog.
 * These are real federal grant-making agencies (aggregated via Grants.gov &
 * SBIR.gov) plus the platform sources we ingest. Rendered very low-opacity
 * behind the stats numbers on the dark banner. Edit this list freely.
 */
const SOURCES = [
  "Grants.gov",
  "SBIR.gov",
  "STTR Program",
  "Zeffy Foundations",
  "National Science Foundation",
  "National Institutes of Health",
  "NASA",
  "Dept. of Energy",
  "Dept. of Defense",
  "USDA",
  "Dept. of Education",
  "EPA",
  "DARPA",
  "NOAA",
  "Small Business Administration",
  "Health & Human Services",
  "Dept. of Transportation",
  "HUD",
  "Dept. of Justice",
  "Dept. of Labor",
  "Veterans Affairs",
  "Homeland Security",
  "Dept. of the Interior",
  "Dept. of Commerce",
  "Dept. of State",
  "Dept. of the Treasury",
  "FEMA",
  "CDC",
  "ARPA-E",
  "National Endowment for the Arts",
  "National Endowment for the Humanities",
  "NIST",
  "Centers for Medicare & Medicaid",
  "Admin. for Children & Families",
  "HRSA",
  "SAMHSA",
  "National Institute of Justice",
  "US Forest Service",
  "Bureau of Land Management",
  "Fish & Wildlife Service",
  "Economic Development Admin.",
  "Federal Highway Admin.",
  "Office of Naval Research",
  "Air Force Research Lab",
  "Army Research Office",
  "AHRQ",
  "National Park Service",
  "Institute of Museum & Library Services",
  "USAID",
  "AmeriCorps",
  "Appalachian Regional Commission",
  "Bureau of Indian Affairs",
];

export default function DataSourceWatermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-8 md:px-14"
    >
      <p className="w-full text-justify text-[10px] md:text-[11px] font-medium uppercase tracking-[0.22em] leading-8 text-background/[0.06] [text-align-last:center]">
        {SOURCES.join("   ·   ")}
      </p>
    </div>
  );
}
