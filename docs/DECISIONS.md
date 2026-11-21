# Decision log

Each entry: what was unclear, the options, the choice, and why.

## D1 Seed districts
- **Unclear:** the brief seeds "1 district" but also "a centre in a different district to test isolation".
- **Choice:** 2 districts. Nagpur has Anika's centre and Dev, Meera, Kabir. Amravati has a second centre (user `ravi`) and one officer (`isha`).
- **Why:** isolation cannot be tested with one district. `ravi` and `isha` appear on the role switcher under "Other district".

## D2 Approval uniqueness
- **Unclear:** Section 2 says unique `(batch, revision, officer)`; Section 8 says `(batch, revision, step, officer)`.
- **Choice:** a partial unique index on `(batchId, revision, step, officerId) WHERE superseded = false AND withdrawnAt IS NULL`. It lives in hand-written SQL in the first migration.
- **Why:** rows are never deleted, so a plain unique index would stop an officer who withdrew from approving again. The partial index still makes "one officer counts as two" impossible at the database level.

## D3 Withdrawing an approval
- **Choice:** the row gets `withdrawnAt`, the batch `version` goes up, and an `APPROVAL_WITHDRAWN` audit row and outbox event are written. This is only allowed while the batch is `PENDING_DISTRICT`. After that, only the State office can send it back.

## D4 Two-officer rule
- **Choice:** approving needs 2 distinct district officers. A single officer can reject or send back immediately.
- **Why:** that is what the Section 3 state machine shows. It is cheap to stop a bad batch and expensive to pass one.

## D5 Who may act after the district step
- **Choice:** Quality acts at `PENDING_QUALITY`. State may send back or reject at any `PENDING_*` step, but approve only at `PENDING_STATE`. State cannot skip Quality, and Quality cannot give final approval.

## D6 Resubmission (Moment 6)
- **Choice:** on resubmit, every earlier decision is marked `superseded` (kept, never deleted), `revision` goes up by 1, the batch restarts at `PENDING_DISTRICT`, and it needs 2 fresh district approvals. The audit log records `APPROVALS_SUPERSEDED` with a count.
- **Why:** the content may have changed, so earlier approvals approved something else.

## D7 Re-importing candidates
- **Choice:** an import replaces the whole candidate list, all or nothing. It is allowed only in `DRAFT` and `SENT_BACK`. Unknown columns are rejected rather than ignored, so no data is silently dropped.

## D8 Large batch
- **Choice:** `candidateCount >= QUALITY_THRESHOLD` (env, default 50).

## D9 SLA clock
- **Choice:** the clock runs from `currentStepEnteredAt` in `PENDING_*` states only. A partial approval does not reset it, and a breach is recorded at most once per step entry. Default is 48h; `SLA_OVERRIDE_SECONDS` sets a demo value (e.g. 120). Two triggers: a delayed BullMQ job scheduled when the batch enters a step, and a periodic sweep as a safety net. Flagging a breach does not bump `version`, so a reviewer's open page stays valid.
- **Why:** "stuck" means a reviewer step has not finished. A centre holding a sent-back batch is not a reviewer delay.

## D10 Phone numbers
- **Choice:** accept `+91XXXXXXXXXX`, `91…`, `0…` or 10 digits (spaces and dashes ignored) and store E.164. Indian mobiles only.

## D11 Download links
- **Choice:** token = HMAC-SHA256(`DOWNLOAD_TOKEN_SECRET`, certificateId), 256 bits, base64url. The database stores only its SHA-256. Links do not expire (candidates open them weeks later). A revoked certificate returns `410`.
- **Why:** an HMAC (not a stored random value) lets any worker rebuild the link when retrying a WhatsApp send, while a database leak still gives no working links. Trade-off: rotating the secret invalidates old links.

## D12 Public verify fields
- **Choice:** masked name (`A**** S****`, always 4 stars so the name's length is not leaked), course, centre, district, issue date, status and revocation date. Nothing else.

## D13 Certificate numbers
- **Choice:** `PSM-<year>-` + 10 random Crockford base32 characters + a Luhn mod-32 check character. The DB has a unique constraint and generation retries on collision. Malformed numbers or a bad check character never reach Redis or Postgres.

## D14 Append-only audit log
- **Choice:** a Postgres trigger rejects UPDATE and DELETE on `AuditLog`, and DELETE on `Approval`. Audit rows are written in the same transaction as the change they describe.
- **Note:** `TRUNCATE` is not blocked (tests use it). In production the app's database role should not have TRUNCATE.

## D15 Migrations at startup
- **Choice:** a one-shot `migrate` compose service (`migrate deploy` + idempotent seed). api and worker start only after it completes successfully, so scaling api never races migrations.

## D16 Tooling
- **Choice:** npm workspaces; TypeScript is run with `tsx` in dev and in containers (no separate compile step); `tsc --noEmit` is used for type checking. Docker images are `node:24-bookworm-slim`.
- **Why:** fewer moving parts. Prisma is most reliable on Debian-based slim images.

## D17 Test infrastructure
- **Choice:** `docker-compose.test.yml` runs dedicated Postgres, Redis and MinIO; tests use Vitest + Supertest, not Testcontainers. The M3 test runs the API, mock provider and workers in-process against the real stores.
- **Why:** Testcontainers is less reliable on Windows Docker Desktop.

## D18 Auth cookie
- **Choice:** HS256 JWT, 8h expiry, `httpOnly`, `SameSite=Lax`, `Secure` when `COOKIE_SECURE=true`. The algorithm is pinned on verify (blocks `alg: none`). Claims are re-validated with zod.

## D19 Ports and one origin
- **Choice:** web on `:8080` (nginx), which proxies `/api`, `/socket.io`, `/admin` and `/mock-whatsapp`, so the browser talks to one origin. api is published as `3000-3001` so `--scale api=2` does not collide on the host. The mock provider is on `:4000` and the MinIO console on `:9001`.

## D20 Time
- **Choice:** store in UTC, display in IST (`Asia/Kolkata`).

## D21 Shared server package
- **Unclear:** the suggested layout has `apps/api/src/domain` and `packages/shared`, but the worker needs the same database and service code.
- **Choice:** `packages/shared` holds isomorphic code (state machine, policy, zod schemas, events), also used by the web app. `packages/server` holds server-only code (Prisma, queues, services, job processors) used by api and worker. The state machine is `packages/shared/src/domain/batchStateMachine.ts`.

## D22 Optimistic locking contract
- **Choice:** review decisions must send the version they reviewed (`If-Match` header or `version` in the body), otherwise `428`. A stale version returns `409 VERSION_CONFLICT` and the UI reloads. Every write is `UPDATE … WHERE id = ? AND version = ?` inside the same transaction as the approval insert, audit row and outbox event.

## D23 Unknown request fields
- **Unclear:** "role in request body ignored" vs "reject unknown fields".
- **Choice:** reject (`400`), which is stricter than ignoring. Role headers (`X-User-Role`) are ignored; identity comes only from the cookie.

## D24 Delivery semantics
- **Choice:**
  - One `Delivery` per certificate per channel, with an idempotency key `dlv-<id>-g<generation>`. Retries after timeouts, 5xx or 429 reuse the same key, so the provider de-duplicates. 429 honours `Retry-After`.
  - A definite "failed" receipt from the provider bumps the generation (new key, new message), up to 3 generations. After that, or after `WHATSAPP_MAX_ATTEMPTS` transport attempts, the delivery is `DEAD`, goes to the `whatsapp.dlq` queue, and the batch ends `PARTIALLY_ISSUED`. The State office can re-drive dead deliveries.
  - A late "delivered" receipt can move `DEAD` to `DELIVERED`, because the provider is the truth about what reached the phone.
  - The batch is `ISSUED` when every certificate exists and every delivery is `DELIVERED`.

## D25 Revocation cache strategy
- **Choice:** write-through instead of delete.
  - Readers fill the Redis cache with `SET NX`.
  - Revocation overwrites the entry with REVOKED right after commit, and again from the outbox handler.
  - Revocation is permanent, so a REVOKED entry can never be wrong, and a slow reader can never overwrite it with VALID.
  - If Redis is down, verify falls back to Postgres.

## D27 MinIO container image
- **Problem:** `minio/minio` is no longer published on Docker Hub ("repository does not exist"), and `quay.io/minio/minio` needs authentication.
- **Options:** Bitnami's archived MinIO build, SeaweedFS's S3 gateway, LocalStack, or building MinIO from source.
- **Choice:** `bitnamilegacy/minio:2025.7.23`, pinned. It is still MinIO, so the brief is met and no code changes: the app only speaks the S3 API.
- **Trade-off:** the image is archived and gets no security updates. That is fine for local demo and tests; production uses managed S3 (see DEPLOYMENT.md). If it ever disappears, `chrislusf/seaweedfs` (`weed server -s3`) is a drop-in S3 replacement.

## D26 Rate limiting fails open
- **Choice:** if Redis is unreachable, the limiter lets requests through and logs an error.
- **Why:** public verification staying available matters more than strict limits during a short Redis outage.
