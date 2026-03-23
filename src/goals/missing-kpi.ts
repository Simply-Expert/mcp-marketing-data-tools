import type { GoalsYAML, MissingKPI, MissingKPIsResult } from '../types.js';
import { getGoalTargets } from './loader.js';

/** Set of goal keys that have a connected data source in Phase 1 */
const CONNECTED_SOURCES = new Set([
  'downloads.ios',        // App Store client
  'downloads.android',    // Play Store client
  'downloads.total',      // Computed from both
  'revenue.mrr',          // Stripe client
  'revenue.app_revenue',  // Computed from App Store + Play Store
  'subscriptions.new_subscribers', // Stripe client
  'subscriptions.churn_rate',      // Stripe client
  'app_health.ios_rating',         // App Store client
  'app_health.crash_free_rate',    // Play Store client
  'paid_acquisition.total_spend',            // Meta Ads client
  'paid_acquisition.blended_roas',           // Meta Ads client
  'paid_acquisition.cpa',                    // Meta Ads client
  'organic_social.instagram_followers_growth', // Meta Organic client
  'organic_social.engagement_rate',            // Meta Organic client
  'organic_search.total_clicks',      // Search Console client
  'organic_search.average_ctr',       // Search Console client
  'organic_search.average_position',  // Search Console client
]);

/** Reason why a goal has no data source */
const MISSING_REASONS: Record<string, string> = {
  'app_health.android_rating': 'Play Store ratings API not yet implemented',
};

export function findMissingKPIs(goals: GoalsYAML): MissingKPIsResult {
  const targets = getGoalTargets(goals);
  const missing: MissingKPI[] = [];

  for (const target of targets) {
    if (!CONNECTED_SOURCES.has(target.key)) {
      missing.push({
        key: target.key,
        label: target.label,
        target: target.target,
        reason: MISSING_REASONS[target.key] ?? 'No data source connected',
      });
    }
  }

  return { missing };
}
