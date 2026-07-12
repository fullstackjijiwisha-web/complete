/**
 * DEPRECATED — do not use.
 * ========================
 * This prototype seed populated an older question bank (tagged
 * `posh-act-2013`). That bank has been superseded by the curated set in
 * `src/modules/questions/question.seed.ts`, which the app now seeds
 * automatically on startup and which the standalone TypeScript seeder runs:
 *
 *   npx tsx scripts/seed-questions.ts
 *
 * Running this file again would re-insert the old prototype questions; the app
 * retires them (`isActive: false`) on its next boot, so they will not appear in
 * any assessment. Kept only as a stub to avoid confusion.
 */
console.error(
  'seed-questions.mjs is deprecated. Use `npx tsx scripts/seed-questions.ts` ' +
    '(curated bank in src/modules/questions/question.seed.ts).',
);
process.exit(1);
