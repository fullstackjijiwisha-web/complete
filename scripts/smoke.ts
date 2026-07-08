// Boots the app without a database and checks /health, /ready, and a 404.
// Run: npx tsx scripts/smoke.ts
process.env.NODE_ENV = 'development';
process.env.MONGODB_URI = 'mongodb://localhost:27017/posh_compass_smoke';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);

async function main(): Promise<void> {
  const { createApp } = await import('../src/app');
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  const health = await fetch(`${base}/health`);
  console.log('GET /health →', health.status, await health.text());

  const ready = await fetch(`${base}/ready`);
  console.log('GET /ready  →', ready.status, await ready.text());

  const unknown = await fetch(`${base}/api/v1/nope`);
  console.log('GET 404     →', unknown.status, await unknown.text());

  const noAuth = await fetch(`${base}/api/v1/users/me`);
  console.log('GET /users/me (no token) →', noAuth.status, await noAuth.text());

  server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('SMOKE FAILED', err);
  process.exit(1);
});
