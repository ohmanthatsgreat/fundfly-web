import OpportunityList from "@/components/OpportunityList";

export default function PersonalGrantsPage() {
  return (
    <OpportunityList
      title="Personal Grants"
      filters={{ audience: "personal,both" }}
    />
  );
}
