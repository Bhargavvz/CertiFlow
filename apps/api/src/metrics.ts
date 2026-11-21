// Prometheus metrics at GET /metrics. Gauges are computed on scrape from Postgres
// and BullMQ, so every API instance reports the same system-wide numbers.
import client from 'prom-client';
import { ALL_QUEUES, getQueue, prisma } from '@certiflow/server';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new client.Counter({
  name: 'certiflow_http_requests_total',
  help: 'HTTP requests by method, route and status',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

new client.Gauge({
  name: 'certiflow_queue_jobs',
  help: 'BullMQ jobs by queue and state (waiting, active, delayed, failed, completed)',
  labelNames: ['queue', 'state'] as const,
  registers: [registry],
  async collect() {
    for (const name of ALL_QUEUES) {
      const counts = await getQueue(name).getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
      for (const [state, n] of Object.entries(counts)) this.set({ queue: name, state }, n);
    }
  },
});

new client.Gauge({
  name: 'certiflow_deliveries',
  help: 'WhatsApp deliveries by status',
  labelNames: ['status'] as const,
  registers: [registry],
  async collect() {
    this.reset();
    const rows = await prisma.delivery.groupBy({ by: ['status'], _count: { _all: true } });
    for (const r of rows) this.set({ status: r.status }, r._count._all);
  },
});

new client.Gauge({
  name: 'certiflow_batches',
  help: 'Batches by status',
  labelNames: ['status'] as const,
  registers: [registry],
  async collect() {
    this.reset();
    const rows = await prisma.batch.groupBy({ by: ['status'], _count: { _all: true } });
    for (const r of rows) this.set({ status: r.status }, r._count._all);
  },
});

new client.Gauge({
  name: 'certiflow_sla_breached_batches',
  help: 'Batches currently waiting past their SLA',
  registers: [registry],
  async collect() {
    this.set(await prisma.batch.count({ where: { slaBreachedAt: { not: null }, status: { in: ['PENDING_DISTRICT', 'PENDING_QUALITY', 'PENDING_STATE'] } } }));
  },
});

new client.Gauge({
  name: 'certiflow_outbox_pending',
  help: 'Outbox events not yet relayed (should stay near zero)',
  registers: [registry],
  async collect() {
    this.set(await prisma.outboxEvent.count({ where: { publishedAt: null } }));
  },
});
