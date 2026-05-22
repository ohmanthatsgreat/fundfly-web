import OpportunityList from "@/components/OpportunityList";

export default function ArchivePage() {
  return (
    <OpportunityList
      endpoint="/api/app/dismissed/list"
      title="Archived Opportunities"
    />
  );
}
