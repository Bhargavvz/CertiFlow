// Bull Board at /admin/queues (STATE only): inspect jobs, retries and the DLQ.
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { ALL_QUEUES, getQueue } from '@certiflow/server';

export function bullBoardRouter(basePath = '/admin/queues') {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(basePath);
  createBullBoard({
    queues: ALL_QUEUES.map((name) => new BullMQAdapter(getQueue(name))),
    serverAdapter,
  });
  return serverAdapter.getRouter();
}
