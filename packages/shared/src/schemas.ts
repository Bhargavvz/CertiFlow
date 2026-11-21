// zod schemas for every request body. `.strict()` rejects unknown fields, so a
// client cannot even attempt to smuggle `role` or `officerId` into a request.
import { z } from 'zod';

export const demoLoginSchema = z.object({ userKey: z.string().trim().min(1).max(40) }).strict();

export const createBatchSchema = z
  .object({ courseName: z.string().trim().min(3, 'Course name must be at least 3 characters').max(120) })
  .strict();

export const updateBatchSchema = createBatchSchema;

export const DECISION_ACTIONS = ['approve', 'reject', 'send_back'] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

export const decisionSchema = z
  .object({
    action: z.enum(DECISION_ACTIONS),
    reason: z.string().trim().max(500).optional(),
    version: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.action !== 'approve' && (!v.reason || v.reason.length < 5)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'A reason (at least 5 characters) is required to reject or send back',
      });
    }
  });

export const submitSchema = z.object({ version: z.number().int().nonnegative().optional() }).strict();

export const revokeSchema = z
  .object({ reason: z.string().trim().min(5, 'Give a reason of at least 5 characters').max(500) })
  .strict();

export const certificateSearchSchema = z.object({ q: z.string().trim().max(100).optional() }).strict();
