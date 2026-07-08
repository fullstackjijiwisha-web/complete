import type { QueryFilter, HydratedDocument, Model } from 'mongoose';
import { ApiError } from './ApiError';

// Assert a resource exists AND matches the ownership filter (userId / orgId / auditorId).
// Missing and not-owned are indistinguishable to the caller: both 404 (blueprint §4).
export async function assertOwnership<T>(
  model: Model<T>,
  filter: QueryFilter<T>,
): Promise<HydratedDocument<T>> {
  const doc = await model.findOne(filter);
  if (!doc) throw ApiError.notFound();
  return doc as HydratedDocument<T>;
}
