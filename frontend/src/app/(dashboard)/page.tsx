"use client";

import { AttentionList } from "@/components/providers/AttentionList";
import { DataFreshness } from "@/components/DataFreshness";
import { ProviderSummary } from "@/components/providers/ProviderSummary";
import { ProviderTable } from "@/components/providers/ProviderTable";
import { ErrorState, LoadingState, PageHeader, Section } from "@/components/ui";
import { useProviderDashboard } from "@/lib/useProviderDashboard";

export default function OverviewPage() {
  const state = useProviderDashboard();
  return (
    <>
      <PageHeader
        title="Provider documentation"
        description="How provider documentation is doing, and who needs attention."
        aside={state.status === "ready" ? <DataFreshness fetchedAt={state.data.meta.source.fetchedAt} timezone={state.data.meta.timezone} refreshing={state.refreshing} onRefresh={state.refresh} /> : undefined}
      />
      {state.status === "loading" && <LoadingState />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && (
        <>
          <ProviderSummary data={state.data} />
          <AttentionList providers={state.data.providers} />
          <Section title="Providers">
            <ProviderTable data={state.data} />
          </Section>
        </>
      )}
    </>
  );
}
