import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from 'prom-client';

/**
 * The Prometheus registry of this process: Node's own numbers (memory, event
 * loop lag, GC, handles) plus one pair of HTTP series.
 *
 * Both HTTP series are labelled by the route pattern (`/api/transactions/:id`),
 * never the URL: a label per id would give the time series a cardinality of
 * one per record, which is how a metrics backend is brought down.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly requests = new Counter({
    name: 'http_requests_total',
    help: 'HTTP requests handled, by route and status',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  readonly duration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'How long handling a request took',
    labelNames: ['method', 'route', 'status'] as const,
    // From a cached read to a slow import: wider than the default buckets
    // at the top, finer at the bottom where most requests land.
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  observe(labels: {
    method: string;
    route: string;
    status: number;
    seconds: number;
  }): void {
    const { seconds, ...rest } = labels;
    const values = { ...rest, status: String(rest.status) };
    this.requests.inc(values);
    this.duration.observe(values, seconds);
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}
