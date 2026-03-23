import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import type { GoalsYAML, GoalTarget } from '../types.js';

const GOALS_PATH = path.resolve(process.env.GOALS_PATH || './goals.yaml');

export async function loadGoals(): Promise<GoalsYAML> {
  const content = await fs.readFile(GOALS_PATH, 'utf-8');
  const parsed = yaml.load(content);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`goals.yaml is empty or invalid at ${GOALS_PATH}`);
  }
  return parsed as GoalsYAML;
}

/** Flatten goals.yaml into a list of GoalTarget entries */
export function getGoalTargets(goals: GoalsYAML): GoalTarget[] {
  const targets: GoalTarget[] = [];
  const mt = goals.monthly_targets;

  if (mt.downloads) {
    if (mt.downloads.ios != null) targets.push({ key: 'downloads.ios', label: 'iOS Downloads', target: mt.downloads.ios, category: 'downloads' });
    if (mt.downloads.android != null) targets.push({ key: 'downloads.android', label: 'Android Downloads', target: mt.downloads.android, category: 'downloads' });
    if (mt.downloads.total != null) targets.push({ key: 'downloads.total', label: 'Total Downloads', target: mt.downloads.total, category: 'downloads' });
  }

  if (mt.revenue) {
    if (mt.revenue.mrr != null) targets.push({ key: 'revenue.mrr', label: 'MRR', target: mt.revenue.mrr, category: 'revenue' });
    if (mt.revenue.app_revenue != null) targets.push({ key: 'revenue.app_revenue', label: 'App Revenue', target: mt.revenue.app_revenue, category: 'revenue' });
  }

  if (mt.subscriptions) {
    if (mt.subscriptions.new_subscribers != null) targets.push({ key: 'subscriptions.new_subscribers', label: 'New Subscribers', target: mt.subscriptions.new_subscribers, category: 'subscriptions' });
    if (mt.subscriptions.churn_rate != null) targets.push({ key: 'subscriptions.churn_rate', label: 'Churn Rate', target: mt.subscriptions.churn_rate, category: 'subscriptions' });
  }

  if (mt.paid_acquisition) {
    if (mt.paid_acquisition.total_spend != null) targets.push({ key: 'paid_acquisition.total_spend', label: 'Total Ad Spend', target: mt.paid_acquisition.total_spend, category: 'paid_acquisition' });
    if (mt.paid_acquisition.blended_roas != null) targets.push({ key: 'paid_acquisition.blended_roas', label: 'Blended ROAS', target: mt.paid_acquisition.blended_roas, category: 'paid_acquisition' });
    if (mt.paid_acquisition.cpa != null) targets.push({ key: 'paid_acquisition.cpa', label: 'CPA', target: mt.paid_acquisition.cpa, category: 'paid_acquisition' });
  }

  if (mt.organic_social) {
    if (mt.organic_social.instagram_followers_growth != null) targets.push({ key: 'organic_social.instagram_followers_growth', label: 'Instagram Follower Growth', target: mt.organic_social.instagram_followers_growth, category: 'organic_social' });
    if (mt.organic_social.engagement_rate != null) targets.push({ key: 'organic_social.engagement_rate', label: 'Engagement Rate', target: mt.organic_social.engagement_rate, category: 'organic_social' });
  }

  if (mt.app_health) {
    if (mt.app_health.ios_rating != null) targets.push({ key: 'app_health.ios_rating', label: 'iOS Rating', target: mt.app_health.ios_rating, category: 'app_health' });
    if (mt.app_health.android_rating != null) targets.push({ key: 'app_health.android_rating', label: 'Android Rating', target: mt.app_health.android_rating, category: 'app_health' });
    if (mt.app_health.crash_free_rate != null) targets.push({ key: 'app_health.crash_free_rate', label: 'Crash-Free Rate', target: mt.app_health.crash_free_rate, category: 'app_health' });
  }

  if (mt.organic_search) {
    if (mt.organic_search.total_clicks != null) targets.push({ key: 'organic_search.total_clicks', label: 'Organic Search Clicks', target: mt.organic_search.total_clicks, category: 'organic_search' });
    if (mt.organic_search.average_ctr != null) targets.push({ key: 'organic_search.average_ctr', label: 'Organic Search CTR', target: mt.organic_search.average_ctr, category: 'organic_search' });
    if (mt.organic_search.average_position != null) targets.push({ key: 'organic_search.average_position', label: 'Organic Search Avg Position', target: mt.organic_search.average_position, category: 'organic_search' });
  }

  return targets;
}
