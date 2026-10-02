"use client";

import { DataFreshness } from "@/components/DataFreshness";
import { ProductionTable } from "@/components/scribes/ProductionTable";
import { ScopeLine } from "@/components/scribes/ScopeLine";
import { ScribeSummary } from "@/components/scribes/ScribeSummary";
import { ScribeTable } from "@/components/scribes/ScribeTable";
import { ErrorState, LoadingState, PageHeader, Section } from "@/components/ui";
import { useScribeDashboard } from "@/lib/useScribeDashboard";

export default function ScribesPage() {
  const state = useScribeDashboard();
  return (
    <>
      <PageHeader
        title="Scribe production"
        description="What scribes produced and uploaded, by work date."
        aside={state.status === "ready" ? <DataFreshness fetchedAt={state.data.meta.source.fetchedAt} timezone={state.data.meta.timezone} refreshing={state.refreshing} onRefresh={state.refresh} /> : undefined}
      />
      {state.status === "loading" && <LoadingState />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && (
        <>
          <ScopeLine meta={state.data.meta} />
          <ScribeSummary totals={state.data.totals} />
          <Section
            title="Scribes"
            note="Listed alphabetically. Notes uploaded is upload activity and is not compared with notes produced: uploads can be for work produced on earlier dates."
          >
            <ScribeTable data={state.data} />
          </Section>
          <Section title="Production over time">
            <ProductionTable
              series={state.data.production}
              scope={{ from: state.data.meta.scope.historyStartsOn, to: state.data.meta.scope.dataThrough }}
              options={["weekly", "monthly"]}
            />
          </Section>
        </>
      )}
    </>
  );
}
