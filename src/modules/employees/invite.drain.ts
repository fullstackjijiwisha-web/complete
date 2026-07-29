import { User } from '../users/user.model';
import { Organisation } from '../organisations/organisation.model';
import { issueInvite } from './employee.service';
import { logger } from '../../utils/logger';
import { logAudit } from '../auditlog/auditLog.model';

// Guarantees every enrolled employee eventually receives an invite, even when
// a single day's send allowance is smaller than the roster: anyone still
// un-activated whose invite email was NOT accepted by a mail provider is
// retried here. Runs on a schedule (Vercel Cron → /api/v1/cron/invite-drain)
// and can be triggered by a super admin, so a 450-person import that exceeded
// today's quota completes by itself once the allowance resets.
export interface DrainResult {
  candidates: number;
  attempted: number;
  delivered: number;
  failed: number;
  remaining: number;
  sampleError?: string;
}

export async function drainUndeliveredInvites(
  limit = 100,
  originUrl?: string,
): Promise<DrainResult> {
  // `$ne: 'sent'` also matches employees invited before delivery tracking
  // existed (field absent) — exactly the backlog that needs re-sending.
  const filter = {
    role: 'employee' as const,
    isDeleted: false,
    status: 'invited' as const,
    inviteDelivery: { $ne: 'sent' as const },
  };

  const candidates = await User.countDocuments(filter);
  if (candidates === 0) {
    return { candidates: 0, attempted: 0, delivered: 0, failed: 0, remaining: 0 };
  }

  // Oldest attempt first, so nobody is starved by a repeatedly-retried head.
  const batch = await User.find(filter)
    .sort({ inviteSentAt: 1, createdAt: 1 })
    .limit(limit)
    .select('email whatsapp orgId');

  const orgIds = [...new Set(batch.map((u) => u.orgId?.toString()).filter(Boolean))] as string[];
  const orgs = await Organisation.find({ _id: { $in: orgIds } }).select('name');
  const orgNameById = new Map(orgs.map((o) => [o.id as string, o.name]));

  let delivered = 0;
  let failed = 0;
  let sampleError: string | undefined;

  const CONCURRENCY = 5;
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const slice = batch.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      slice.map((u) =>
        issueInvite(
          u.id,
          u.orgId!.toString(),
          u.email,
          orgNameById.get(u.orgId!.toString()) ?? 'Your organisation',
          u.whatsapp,
          originUrl,
        ),
      ),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.delivered) {
        delivered += 1;
      } else {
        failed += 1;
        const reason =
          r.status === 'fulfilled' ? r.value.error ?? r.value.mode : (r.reason as Error).message;
        if (!sampleError && reason) sampleError = String(reason).slice(0, 200);
      }
    }
    // Every remaining send will hit the same wall once an allowance is
    // exhausted — stop early rather than burning the rest of the batch.
    if (delivered === 0 && failed >= CONCURRENCY) break;
  }

  const result: DrainResult = {
    candidates,
    attempted: delivered + failed,
    delivered,
    failed,
    remaining: Math.max(0, candidates - delivered),
    ...(sampleError ? { sampleError } : {}),
  };
  logger.info('Invite drain run', result);
  if (delivered > 0) {
    // Scheduled run — no human actor, so actorId stays unset (it must be a
    // valid ObjectId or absent, never a placeholder string).
    await logAudit('invite.drain_run', 'System', 'invite-drain', undefined, {
      delivered,
      failed,
      remaining: result.remaining,
    });
  }
  return result;
}
