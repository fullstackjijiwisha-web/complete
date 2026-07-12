/* Seeds the question bank (and a few open audit slots) so the platform is
   usable end-to-end. Idempotent: the curated bank lives in
   `src/modules/questions/question.seed.ts` (the single source of truth, also
   synced automatically on app startup) and each item is upserted by its unique
   `seed:<key>` tag. This script just runs that sync against whatever
   MONGODB_URI is configured, plus opens a few audit slots.

   Run:  npx tsx scripts/seed-questions.ts */
import { connectDb, disconnectDb } from '../src/config/db';
import { AuditSlot } from '../src/modules/audits/audit.model';
import { seedCuratedBank } from '../src/modules/questions/question.seed';

async function main(): Promise<void> {
  await connectDb();

  const { inserted, retired, total } = await seedCuratedBank();
  console.log(`Questions: ${inserted} inserted, ${retired} legacy retired, ${total} active in bank`);

  // A few open audit slots (weekday mornings over the next three weeks) so
  // POSH-Ready organisations can book without a Super Admin round-trip.
  const openSlots = await AuditSlot.countDocuments({ isBooked: false, startsAt: { $gt: new Date() } });
  if (openSlots === 0) {
    const slots: Array<{ startsAt: Date }> = [];
    for (let day = 7; day <= 21 && slots.length < 6; day++) {
      const d = new Date();
      d.setDate(d.getDate() + day);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      d.setHours(10, 0, 0, 0);
      slots.push({ startsAt: d });
    }
    await AuditSlot.insertMany(slots);
    console.log(`Audit slots: ${slots.length} inserted`);
  } else {
    console.log(`Audit slots: ${openSlots} already open — skipped`);
  }

  await disconnectDb();
}

main().catch((err) => {
  console.error('Seed failed:', (err as Error).message);
  process.exit(1);
});
