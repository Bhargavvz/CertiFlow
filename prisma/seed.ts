// `npx prisma db seed` — idempotent, so the migrate container can run it on every start.
import { PrismaClient } from '@prisma/client';
import { seedDemoBatches, seedReferenceData } from './seed-data';

async function main() {
  const prisma = new PrismaClient();
  try {
    const refs = await seedReferenceData(prisma);
    const created = await seedDemoBatches(prisma, refs);
    console.log(
      `Seed complete: ${Object.keys(refs.users).length} demo users, ${created} demo batches created` +
        (created === 0 ? ' (batches already existed, left untouched)' : ''),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
