/**
 * Single-value TTL cache with in-flight de-duplication, so concurrent dashboard
 * requests trigger at most one Google Sheets read.
 */
export class TtlCache<T> {
  private value: { data: T; storedAt: number } | undefined;
  private inFlight: Promise<T> | undefined;

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async get(load: () => Promise<T>, opts: { refresh?: boolean } = {}): Promise<{ data: T; cached: boolean; storedAt: number }> {
    if (!opts.refresh && this.value && this.now() - this.value.storedAt < this.ttlMs) {
      return { ...this.value, cached: true };
    }
    if (!this.inFlight) {
      this.inFlight = load()
        .then((data) => {
          this.value = { data, storedAt: this.now() };
          return data;
        })
        .finally(() => {
          this.inFlight = undefined;
        });
    }
    const data = await this.inFlight;
    return { data, cached: false, storedAt: this.value?.storedAt ?? this.now() };
  }
}
