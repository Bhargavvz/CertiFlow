# CertiFlow

Skilling certificate issuance for the (fictional) Pragati Skills Mission. Centres upload candidates; district, quality and state officers review; certificates go to candidates' phones over WhatsApp; anyone can verify a certificate by number or QR code.

> The full README (requirements note, decisions table, demo script, AI usage, known limitations), SETUP.md and DEPLOYMENT.md are written in the documentation phase. Until then, see `docs/DECISIONS.md` and `docs/architecture.md`.

## Quick start

```bash
docker compose up --build
```

- App: http://localhost:8080 (role switcher: Anika, Dev, Meera, Kabir, Neha, Farah)
- Public verify: http://localhost:8080/verify
- Mock candidate phone: http://localhost:8080/phone
- API: http://localhost:3000 (`/healthz`, `/readyz`, `/metrics`)
- Bull Board: http://localhost:8080/admin/queues (sign in as Farah first)
- MinIO console: http://localhost:9001

Demo SLA of 2 minutes: `SLA_OVERRIDE_SECONDS=120 docker compose up --build`.

## Tests

```bash
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from tests
```

or, with Node installed: start the backing services with `docker compose -f docker-compose.test.yml up -d postgres-test redis-test minio-test`, then run `npm install && npx prisma generate && npm test`.

| Requirement | Test file |
|---|---|
| M1 bad spreadsheet rows | `tests/m1-import.test.ts`, `tests/unit/candidateRow.test.ts` |
| M2 concurrent approvals | `tests/m2-concurrent-approvals.test.ts` |
| M3 60-candidate issuance, unreliable WhatsApp | `tests/m3-issuance.test.ts` |
| M4 revocation | `tests/m4-revocation.test.ts` |
| M5 SLA breach | `tests/m5-sla.test.ts` |
| M6 send back & resubmit | `tests/m6-resubmit.test.ts` |
| Never: wrong actor | `tests/never-wrong-actor.test.ts`, `tests/unit/authorization.test.ts` |
| Never: duplicate certificates | `tests/never-duplicates.test.ts` |
| Never: revoked shows genuine | `tests/m4-revocation.test.ts` |
| Never: data leak | `tests/never-data-leak.test.ts` |
| Never: untraceable decision | `tests/never-untraceable.test.ts` |
