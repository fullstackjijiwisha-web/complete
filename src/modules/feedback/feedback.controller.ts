import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { Feedback } from './feedback.model';
import { AssessmentAttempt } from '../assessments/attempt.model';
import { Organisation } from '../organisations/organisation.model';
import { ApiError } from '../../utils/ApiError';
import { authUser } from '../../utils/authUser';
import { logAudit } from '../auditlog/auditLog.model';

// Employee: submit (or re-submit — upsert, so a retry is safe) the feedback
// for their own scored attempt. Shown between the submit and the result.
export const submitFeedback: RequestHandler = async (req, res) => {
  const user = authUser(req);
  const { attemptId, ratings, suggestions, suggestionOther, comments } = req.body;

  const attempt = await AssessmentAttempt.findOne({
    _id: attemptId,
    userId: new Types.ObjectId(user.id),
  });
  if (!attempt) throw ApiError.notFound('Attempt not found');
  if (attempt.status !== 'scored') {
    throw ApiError.badRequest('Feedback opens once the attempt is scored');
  }

  await Feedback.findOneAndUpdate(
    { attemptId: attempt._id },
    {
      $set: {
        userId: attempt.userId,
        orgId: attempt.orgId,
        cycle: attempt.cycle,
        ratings,
        suggestions: suggestions ?? [],
        suggestionOther: suggestionOther || undefined,
        comments: comments || undefined,
      },
    },
    { upsert: true },
  );

  await logAudit('feedback.submitted', 'AssessmentAttempt', attempt.id, user.id, {
    recommendation: ratings.recommendation,
  });
  res.status(201).json({ success: true, data: { saved: true } });
};

// Super admin: aggregate stats + latest entries. Deliberately anonymous —
// the form promises "confidential and secure", so the listing shows the
// organisation and cycle but never the employee.
export const adminListFeedback: RequestHandler = async (_req, res) => {
  const [agg] = await Feedback.aggregate<{
    count: number;
    avgOverall: number;
    avgContent: number;
    avgCase: number;
    avgApplication: number;
    avgRecommendation: number;
  }>([
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        avgOverall: { $avg: '$ratings.overall' },
        avgContent: { $avg: '$ratings.content' },
        avgCase: { $avg: '$ratings.caseScenarios' },
        avgApplication: { $avg: '$ratings.application' },
        avgRecommendation: { $avg: '$ratings.recommendation' },
      },
    },
  ]);

  const suggestionAgg = await Feedback.aggregate<{ _id: string; n: number }>([
    { $unwind: '$suggestions' },
    { $group: { _id: '$suggestions', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]);

  const items = await Feedback.find().sort({ createdAt: -1 }).limit(200).lean();
  const orgIds = [...new Set(items.map((i) => i.orgId.toString()))];
  const orgDocs = await Organisation.find({ _id: { $in: orgIds } })
    .select('name')
    .lean();
  const orgNames = new Map(orgDocs.map((o) => [o._id.toString(), o.name]));

  const round1 = (n: number | undefined) => (n == null ? null : Math.round(n * 10) / 10);
  res.json({
    success: true,
    data: {
      stats: {
        count: agg?.count ?? 0,
        avgOverall: round1(agg?.avgOverall),
        avgContent: round1(agg?.avgContent),
        avgCaseScenarios: round1(agg?.avgCase),
        avgApplication: round1(agg?.avgApplication),
        avgRecommendation: round1(agg?.avgRecommendation),
        suggestionCounts: Object.fromEntries(suggestionAgg.map((s) => [s._id, s.n])),
      },
      items: items.map((i) => ({
        id: i._id.toString(),
        orgName: orgNames.get(i.orgId.toString()) ?? '(deleted organisation)',
        cycle: i.cycle,
        createdAt: i.createdAt,
        ratings: i.ratings,
        suggestions: i.suggestions,
        suggestionOther: i.suggestionOther ?? null,
        comments: i.comments ?? null,
      })),
    },
  });
};
