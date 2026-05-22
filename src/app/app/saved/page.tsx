import OpportunityList from "@/components/OpportunityList";

export default function SavedPage() {
  return (
    <OpportunityList
      endpoint="/api/app/saved/list"
      title="Saved Opportunities"
    />
  );
}
