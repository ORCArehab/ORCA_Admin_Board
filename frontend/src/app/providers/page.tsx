"use client";

import { DataFreshness } from "@/components/DataFreshness";
import { ProviderTable } from "@/components/providers/ProviderTable";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { useProviderDashboard } from "@/lib/useProviderDashboard";

export default function ProvidersPage() {
  const state = useProviderDashboard();
  return (
    <>
      <PageHeader
        title="Providers"
        description="Ordered by outstanding notes, then oldest outstanding batch."
        aside={state.status === "ready" ? <DataFreshness fetchedAt={state.data.meta.source.fetchedAt} timezone={state.data.meta.timezone} refreshing={state.refreshing} onRefresh={state.refresh} /> : undefined}
      />
      {state.status === "loading" && <LoadingState />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && <ProviderTable data={state.data} />}
    </>
  );
}
