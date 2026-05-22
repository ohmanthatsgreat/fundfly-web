import OpportunityList from "@/components/OpportunityList";

export default function BizGrantsPage() {
  return (
    <OpportunityList
      title="Business Grants"
      filters={{ type: "grant,foundation", audience: "business,both" }}
    />
  );
}
