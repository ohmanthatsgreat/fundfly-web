import OpportunityList from "@/components/OpportunityList";

export default function BizGrantsPage() {
  return (
    <OpportunityList
      title="Business Grants"
      filters={{ type: "grant,foundation,scholarship", audience: "business,both" }}
    />
  );
}
