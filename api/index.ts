import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../src/app';
import { prepareRuntime } from '../src/bootstrap';

const app = createApp();

let runtimePromise: Promise<void> | null = null;

function ensureRuntime(): Promise<void> {
  if (!runtimePromise) {
    runtimePromise = prepareRuntime().catch((err) => {
      runtimePromise = null;
      throw err;
    });
  }
  return runtimePromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await ensureRuntime();
  await new Promise<void>((resolve, reject) => {
    res.once('finish', () => resolve());
    res.once('close', () => resolve());
    try {
      app(req as never, res as never);
    } catch (err) {
      reject(err);
    }
  });
}