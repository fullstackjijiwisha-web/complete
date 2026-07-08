import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer | null = null;

export async function connectDb(): Promise<void> {
  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error', { message: (err as Error).message });
  });

  let uri = env.MONGODB_URI;

  if (env.NODE_ENV !== 'production' || uri.includes('localhost') || uri.includes('127.0.0.1')) {
    try {
      logger.info('Starting in-memory MongoDB server with persistent storage...');
      mongod = await MongoMemoryServer.create({
        instance: {
          dbPath: './mongodb-data',
          storageEngine: 'wiredTiger',
        },
      });
      uri = mongod.getUri();
      logger.info(`In-memory MongoDB server started at ${uri}`);
    } catch (err) {
      logger.error('Failed to start in-memory MongoDB, attempting direct connection', { message: (err as Error).message });
    }
  }

  await mongoose.connect(uri);
  logger.info('MongoDB connected');
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
}

export function dbIsReady(): boolean {
  return mongoose.connection.readyState === 1;
}
