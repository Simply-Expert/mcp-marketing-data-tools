import type { MonthlySnapshot, GoalsYAML, GoalComparison, GoalsComparisonResult } from '../types.js';
import { getGoalTargets } from './loader.js';

/** Extract an actual metric value from a snapshot given a goal key */
function getActual(snapshot: MonthlySnapshot, key: string): number | null {
  switch (key) {
    case 'downloads.ios':
      return snapshot.appStore?.downloads.totalDownloads ?? null;
    case 'downloads.android':
      return snapshot.playStore?.downloads.totalDownloads ?? null;
    case 'downloads.total': {
      const ios = snapshot.appStore?.downloads.totalDownloads;
      const android = snapshot.playStore?.downloads.totalDownloads;
      if (ios == null && android == null) return null;
      return (ios ?? 0) + (android ?? 0);
    }
    case 'revenue.mrr':
      return snapshot.stripe?.mrr.mrr ?? null;
    case 'revenue.app_revenue': {
      const iosRev = snapshot.appStore?.revenue.totalRevenue;
      const androidRev = snapshot.playStore?.revenue.totalRevenue;
      if (iosRev == null && androidRev == null) return null;
      return (iosRev ?? 0) + (androidRev ?? 0);
    }
    case 'subscriptions.new_subscribers':
      return snapshot.stripe?.subscriptions.new ?? null;
    case 'subscriptions.churn_rate':
      return snapshot.stripe?.churn.churnRate ?? null;
    case 'app_health.ios_rating':
      return snapshot.appStore?.ratings.averageRating ?? null;
    case 'app_health.android_rating':
      // Would need Play Store ratings — not yet in snapshot
      return null;
    case 'app_health.crash_free_rate':
      return snapshot.playStore?.stability?.crashFreeRate ?? null;
    case 'paid_acquisition.total_spend':
      return snapshot.metaAds?.spend.totalSpend ?? null;
    case 'paid_acquisition.blended_roas':
      return snapshot.metaAds?.conversions.roas ?? null;
    case 'paid_acquisition.cpa':
      return snapshot.metaAds?.conversions.cpa ?? null;
    case 'organic_social.instagram_followers_growth':
      return snapshot.metaOrganic?.instagramInsights.followersGrowth ?? null;
    case 'organic_social.engagement_rate':
      return snapshot.metaOrganic?.instagramPosts.engagementRate ?? null;
    case 'organic_search.total_clicks':
      return snapshot.searchConsole?.overview.totalClicks ?? null;
    case 'organic_search.average_ctr':
      return snapshot.searchConsole?.overview.averageCtr ?? null;
    case 'organic_search.average_position':
      return snapshot.searchConsole?.overview.averagePosition ?? null;
    default:
      return null;
  }
}

/** Determine status for a goal comparison */
function determineStatus(actual: number | null, target: number, key: string): GoalComparison['status'] {
  if (actual == null) return 'no_data';
  if (target === 0) return actual === 0 ? 'hit' : 'miss';

  // For "lower is better" metrics (churn rate, CPA), invert the logic
  const lowerIsBetter = key === 'subscriptions.churn_rate' || key === 'paid_acquisition.cpa' || key === 'organic_search.average_position';

  const diff = lowerIsBetter
    ? (target - actual) / target
    : (actual - target) / target;

  if (diff >= 0) return 'hit';
  if (diff >= -0.1) return 'close';
  return 'miss';
}

export function compareGoals(period: string, snapshot: MonthlySnapshot, goals: GoalsYAML): GoalsComparisonResult {
  const targets = getGoalTargets(goals);
  const comparisons: GoalComparison[] = [];

  for (const target of targets) {
    const actual = getActual(snapshot, target.key);
    const difference = actual != null ? actual - target.target : null;
    const percentDiff = actual != null && target.target !== 0
      ? ((actual - target.target) / target.target) * 100
      : null;

    comparisons.push({
      key: target.key,
      label: target.label,
      target: target.target,
      actual,
      difference,
      percentDiff: percentDiff != null ? Math.round(percentDiff * 100) / 100 : null,
      status: determineStatus(actual, target.target, target.key),
      category: target.category,
    });
  }

  const summary = {
    total: comparisons.length,
    hit: comparisons.filter(c => c.status === 'hit').length,
    miss: comparisons.filter(c => c.status === 'miss').length,
    close: comparisons.filter(c => c.status === 'close').length,
    noData: comparisons.filter(c => c.status === 'no_data').length,
  };

  return { period, comparisons, summary };
}
