import OpportunityList from "@/components/OpportunityList";

export default function SbirPage() {
  return (
    <OpportunityList
      title="SBIR / STTR"
      filters={{ type: "sbir,sttr" }}
    />
  );
}
