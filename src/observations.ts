import { performance } from 'node:perf_hooks';
import type { Page } from 'playwright';
import type { Observation, ObservationRecord } from './types.js';

/** Captures independently of the adapter; only one image buffer is retained. */
export class ObservationSampler {
  readonly records: ObservationRecord[] = [];
  readonly failure: Promise<never>;
  private rejectFailure!: (reason: unknown) => void;
  private latest: Observation | null = null;
  private timer: NodeJS.Timeout | null = null;
  private pending: Promise<void> | null = null;
  private stopped = false;

  constructor(private readonly page: Page, private readonly trialId: string, private readonly hz: number) {
    this.failure = new Promise((_resolve, reject) => { this.rejectFailure = reject; });
    void this.failure.catch(() => {});
  }

  async start(): Promise<void> {
    await this.capture();
    this.timer = setInterval(() => {
      void this.capture().catch(error => this.rejectFailure(error));
    }, 1000 / this.hz);
  }

  private capture(): Promise<void> {
    if (this.stopped || this.pending) return Promise.resolve();
    this.pending = this.captureImage().finally(() => { this.pending = null; });
    return this.pending;
  }

  private async captureImage(): Promise<void> {
    const requestedAtMs = performance.now();
    const buffer = await this.page.screenshot({ type: 'png', fullPage: false, animations: 'allow', caret: 'initial' });
    const returnedAtMs = performance.now();
    const id = `${this.trialId}/frame-${this.records.length + 1}`;
    this.records.push({ id, clock: 'runner-performance', requestedAtMs, returnedAtMs,
      exactCaptureAtMs: null, byteLength: buffer.length, deliveries: [] });
    this.latest = { id, image: new Uint8Array(buffer), mimeType: 'image/png', width: 1280, height: 720 };
  }

  observe(): Observation | null {
    if (!this.latest) return null;
    this.records.at(-1)!.deliveries.push(performance.now());
    return { ...this.latest, image: new Uint8Array(this.latest.image) };
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.pending;
  }
}
