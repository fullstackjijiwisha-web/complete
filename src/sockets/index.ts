import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { AuthUser } from '../types';

let io: Server | null = null;

// JWT is verified before any room join (blueprint §6). HR admins (and
// auditors) join their org room for live readiness-meter updates (PRD §6).
export function initSockets(httpServer: HttpServer): void {
  io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGINS.split(','), credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('unauthorized'));
      const payload = verifyAccessToken(token);
      (socket.data as { user: AuthUser }).user = {
        id: payload.sub,
        role: payload.role,
        orgId: payload.orgId,
      };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket.data as { user: AuthUser }).user;
    if (user.orgId && (user.role === 'hr_admin' || user.role === 'auditor')) {
      void socket.join(`org:${user.orgId}`);
    }
  });

  logger.info('Socket.io initialised');
}

export function emitToOrg(orgId: string, event: string, payload: unknown): void {
  io?.to(`org:${orgId}`).emit(event, payload);
}
