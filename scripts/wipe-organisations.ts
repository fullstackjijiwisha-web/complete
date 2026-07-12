/* Danger: permanently deletes every organisation and everything scoped to it
   (HR/employee accounts, assessment attempts, certificates, audits, payments,
   pending invites). Super admin / auditor accounts, the question bank, and
   the append-only audit log are never touched — see
   src/modules/organisations/organisation.reset.ts for the exact scope.

   A full snapshot is written to MongoDB (OrgWipeBackup) *and* to a local JSON
   file under backups/ before anything is deleted, so the action is
   recoverable by hand.

   Usage:
     npx tsx scripts/wipe-organisations.ts            # dry run — counts only
     npx tsx scripts/wipe-organisations.ts --yes       # actually deletes */
import fs from 'fs';
import path from 'path';
import { connectDb, disconnectDb } from '../src/config/db';
import { previewOrganisationWipe, wipeAllOrganisations } from '../src/modules/organisations/organisation.reset';

async function main(): Promise<void> {
  const confirmed = process.argv.includes('--yes');
  await connectDb();

  const counts = await previewOrganisationWipe();
  console.log('About to permanently delete:');
  console.table(counts);

  if (!confirmed) {
    console.log('\nDry run only — nothing was deleted. Re-run with --yes to actually wipe.');
    await disconnectDb();
    return;
  }

  const result = await wipeAllOrganisations('cli-script');

  const dir = path.resolve(__dirname, '../backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `org-wipe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(result.backup, null, 2));

  console.log(`\nDeleted. Backup stored in MongoDB (OrgWipeBackup id: ${result.backupId})`);
  console.log(`Local backup file written to: ${file}`);
  console.table(result.counts);

  await disconnectDb();
}

main().catch((err) => {
  console.error('Wipe failed:', (err as Error).message);
  process.exit(1);
});
