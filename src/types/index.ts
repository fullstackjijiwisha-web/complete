export type Role = 'employee' | 'hr_admin' | 'auditor' | 'super_admin';

export interface AuthUser {
  id: string;
  role: Role;
  orgId?: string;
}

export type ScoreBand = 'below_60' | '60_69' | '70_79' | '80_89' | '90_100';

export function scoreBand(score: number): ScoreBand {
  if (score < 60) return 'below_60';
  if (score < 70) return '60_69';
  if (score < 80) return '70_79';
  if (score < 90) return '80_89';
  return '90_100';
}

export type PerformanceLevel = 'outstanding' | 'excellent' | 'developing' | 'needs_retraining';

export function performanceLevel(score: number): PerformanceLevel {
  if (score >= 90) return 'outstanding';
  if (score >= 80) return 'excellent';
  if (score >= 70) return 'developing';
  return 'needs_retraining';
}
