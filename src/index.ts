#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import {
  StripeMRRInputSchema,
  StripeSubscriptionsInputSchema,
  StripeChurnInputSchema,
  StripeRevenueInputSchema,
  StripeRevenueByPlanInputSchema,
  StripeRevenueByCountryInputSchema,
  StripeRevenueByTypeInputSchema,
  StripeDailyRevenueInputSchema,
  AppStoreDownloadsInputSchema,
  AppStoreRevenueInputSchema,
  AppStoreReviewsInputSchema,
  AppStoreRatingsInputSchema,
  AppStoreSalesReportInputSchema,
  PlayStoreDownloadsInputSchema,
  PlayStoreRevenueInputSchema,
  PlayStoreReviewsInputSchema,
  PlayStoreStabilityInputSchema,
  MetaPageInsightsInputSchema,
  MetaInstagramInsightsInputSchema,
  MetaInstagramPostsInputSchema,
  MetaFacebookVideoPostsInputSchema,
  MetaInstagramVideoPostsInputSchema,
  MetaAdSpendInputSchema,
  MetaAdPerformanceInputSchema,
  MetaAdConversionsInputSchema,
  MetaAdPerformanceByCountryInputSchema,
  GscOverviewInputSchema,
  GscTopQueriesInputSchema,
  GscTopPagesInputSchema,
  GscByCountryInputSchema,
  GscByDeviceInputSchema,
  ReportCollectDataInputSchema,
  ReportCompareMonthsInputSchema,
  GoalsGetTargetsInputSchema,
  GoalsCompareInputSchema,
  GoalsHealthCheckInputSchema,
  GoalsMissingKPIsInputSchema,
} from './schemas.js';

import { StripeClient } from './clients/stripe.js';
import { AppStoreClient } from './clients/appstore.js';
import { PlayStoreClient } from './clients/playstore.js';
import { MetaClient } from './clients/meta.js';
import { SearchConsoleClient } from './clients/searchconsole.js';
import { collectData } from './report/generator.js';
import { loadSnapshot } from './report/snapshot.js';
import { compareMonths } from './report/comparison.js';
import { loadGoals, getGoalTargets } from './goals/loader.js';
import { compareGoals } from './goals/comparator.js';
import { healthCheck } from './goals/health.js';
import { findMissingKPIs } from './goals/missing-kpi.js';

const server = new McpServer({
  name: 'marketing-report',
  version: '1.0.0',
});

// ============================================================
// Stripe Tools
// ============================================================

const stripe = new StripeClient();

server.tool(
  'stripe_get_mrr',
  'Get Monthly Recurring Revenue from Stripe for a given month',
  StripeMRRInputSchema.shape,
  async ({ period }) => {
    const result = await stripe.getMRR(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'stripe_get_subscriptions',
  'Get subscription counts (new, active, canceled, past due) for a given month',
  StripeSubscriptionsInputSchema.shape,
  async ({ period }) => {
    const result = await stripe.getSubscriptions(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'stripe_get_churn',
  'Get churn rate and canceled subscription count for a given month',
  StripeChurnInputSchema.shape,
  async ({ period }) => {
    const result = await stripe.getChurn(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'stripe_get_revenue',
  'Get total Stripe revenue for a given month (all paid invoices)',
  StripeRevenueInputSchema.shape,
  async ({ period }) => {
    const result = await stripe.getRevenue(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'stripe_get_revenue_by_plan',
  'Get revenue broken down by subscription plan/product for a given month',
  StripeRevenueByPlanInputSchema.shape,
  async ({ period }) => {
    const result = await stripe.getRevenueByPlan(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'stripe_get_revenue_by_country',
  'Get revenue broken down by customer country for a given month',
  StripeRevenueByCountryInputSchema.shape,
  async ({ period }) => {
    const result = await stripe.getRevenueByCountry(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'stripe_get_revenue_by_type',
  'Get revenue split by new subscriptions vs renewals for a given month',
  StripeRevenueByTypeInputSchema.shape,
  async ({ period }) => {
    const result = await stripe.getRevenueByType(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'stripe_get_daily_revenue',
  'Get Stripe revenue broken down by day for a date range. Shows revenue, fees, new subscriptions, and renewals per day.',
  StripeDailyRevenueInputSchema.shape,
  async ({ start_date, end_date }) => {
    const result = await stripe.getDailyRevenue(start_date, end_date);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================
// App Store Connect Tools
// ============================================================

const appStore = new AppStoreClient();

server.tool(
  'appstore_get_downloads',
  'Get iOS app downloads for a given month, optionally broken down by country',
  AppStoreDownloadsInputSchema.shape,
  async ({ period, byCountry }) => {
    const result = await appStore.getDownloads(period, byCountry);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'appstore_get_revenue',
  'Get iOS app revenue (IAP + subscriptions) for a given month',
  AppStoreRevenueInputSchema.shape,
  async ({ period, type }) => {
    const result = await appStore.getRevenue(period, type);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'appstore_get_reviews',
  'Get recent App Store reviews for a given month',
  AppStoreReviewsInputSchema.shape,
  async ({ period, limit }) => {
    const result = await appStore.getReviews(period, limit);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'appstore_get_ratings',
  'Get App Store average rating and distribution. Uses iTunes Lookup API for accurate cumulative ratings (including star-only) across top 30 markets, plus text-review distribution for the given month.',
  AppStoreRatingsInputSchema.shape,
  async ({ period }) => {
    const result = await appStore.getRatings(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'appstore_get_sales_report',
  'Get raw App Store sales report rows for a given month. Each row has: productTypeId, units, developerProceeds (per-unit), proceedsCurrency, countryCode, title, subscription (New/Renewal), subscriptionPeriod, proceedsReason, orderType, device, promoCode. Filter by productType: "IAY" for subscriptions, "1F" for first-time downloads, "3F" for redownloads, "7F" for updates.',
  AppStoreSalesReportInputSchema.shape,
  async ({ period, productType }) => {
    const result = await appStore.getSalesRows(period, productType);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ period, rowCount: result.length, rows: result }, null, 2) }] };
  }
);

// ============================================================
// Google Play Tools
// ============================================================

const playStore = new PlayStoreClient();

server.tool(
  'playstore_get_downloads',
  'Get Android app downloads for a given month',
  PlayStoreDownloadsInputSchema.shape,
  async ({ period, byCountry }) => {
    const result = await playStore.getDownloads(period, byCountry);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'playstore_get_revenue',
  'Get Android app revenue for a given month',
  PlayStoreRevenueInputSchema.shape,
  async ({ period }) => {
    const result = await playStore.getRevenue(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'playstore_get_reviews',
  'Get Google Play reviews for a given month',
  PlayStoreReviewsInputSchema.shape,
  async ({ period, limit }) => {
    const result = await playStore.getReviews(period, limit);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'playstore_get_stability',
  'Get Android app stability metrics (crashes, ANRs, crash-free rate) for a given month',
  PlayStoreStabilityInputSchema.shape,
  async ({ period }) => {
    const result = await playStore.getStability(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================
// Meta Tools (Organic Social + Ads)
// ============================================================

const meta = new MetaClient();

server.tool(
  'meta_get_page_insights',
  'Get Facebook Page impressions, reach, engagement, and fans for a given month',
  MetaPageInsightsInputSchema.shape,
  async ({ period }) => {
    const result = await meta.getPageInsights(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'meta_get_instagram_insights',
  'Get Instagram followers, reach, impressions, and profile views for a given month',
  MetaInstagramInsightsInputSchema.shape,
  async ({ period }) => {
    const result = await meta.getInstagramInsights(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'meta_get_instagram_posts',
  'Get top Instagram posts with engagement metrics for a given month',
  MetaInstagramPostsInputSchema.shape,
  async ({ period, limit }) => {
    const result = await meta.getInstagramPosts(period, limit);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'meta_get_facebook_video_posts',
  'Get Facebook video posts with view counts for a given month',
  MetaFacebookVideoPostsInputSchema.shape,
  async ({ period }) => {
    const result = await meta.getFacebookVideoPosts(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'meta_get_instagram_video_posts',
  'Get Instagram video/reel posts with view counts, likes, and comments for a given month',
  MetaInstagramVideoPostsInputSchema.shape,
  async ({ period }) => {
    const result = await meta.getInstagramVideoPosts(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'meta_get_ad_spend',
  'Get total monthly Meta ad spend, impressions, and reach',
  MetaAdSpendInputSchema.shape,
  async ({ period }) => {
    const result = await meta.getAdSpend(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'meta_get_ad_performance',
  'Get Meta campaign-level ad performance metrics (CTR, CPC, CPM)',
  MetaAdPerformanceInputSchema.shape,
  async ({ period }) => {
    const result = await meta.getAdPerformance(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'meta_get_ad_conversions',
  'Get Meta ad conversions, ROAS, and CPA for a given month',
  MetaAdConversionsInputSchema.shape,
  async ({ period }) => {
    const result = await meta.getAdConversions(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'meta_get_ad_performance_by_country',
  'Get Meta ad performance broken down by country for a given month',
  MetaAdPerformanceByCountryInputSchema.shape,
  async ({ period }) => {
    const result = await meta.getAdPerformanceByCountry(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================
// Google Search Console Tools
// ============================================================

let _gsc: SearchConsoleClient | null = null;
function getGsc(): SearchConsoleClient {
  if (!_gsc) _gsc = new SearchConsoleClient();
  return _gsc;
}

server.tool(
  'gsc_get_overview',
  'Get total clicks, impressions, average CTR, and average position from Google Search Console for a given month',
  GscOverviewInputSchema.shape,
  async ({ period }) => {
    const result = await getGsc().getOverview(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'gsc_get_top_queries',
  'Get top search queries ranked by clicks from Google Search Console for a given month',
  GscTopQueriesInputSchema.shape,
  async ({ period, limit }) => {
    const result = await getGsc().getTopQueries(period, limit);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'gsc_get_top_pages',
  'Get top landing pages ranked by clicks from Google Search Console for a given month',
  GscTopPagesInputSchema.shape,
  async ({ period, limit }) => {
    const result = await getGsc().getTopPages(period, limit);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'gsc_get_performance_by_country',
  'Get clicks/impressions/CTR/position by country from Google Search Console for a given month',
  GscByCountryInputSchema.shape,
  async ({ period }) => {
    const result = await getGsc().getPerformanceByCountry(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'gsc_get_performance_by_device',
  'Get clicks/impressions/CTR/position by device (desktop/mobile/tablet) from Google Search Console for a given month',
  GscByDeviceInputSchema.shape,
  async ({ period }) => {
    const result = await getGsc().getPerformanceByDevice(period);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================
// Report Tools
// ============================================================

server.tool(
  'report_collect_data',
  'Pull data from all connected platforms for a given month and save a snapshot. Returns the full snapshot with any errors noted.',
  ReportCollectDataInputSchema.shape,
  async ({ period }) => {
    let gsc: SearchConsoleClient | undefined;
    try { gsc = getGsc(); } catch {}
    const snapshot = await collectData(period, { stripe, appStore, playStore, meta, gsc });
    return { content: [{ type: 'text' as const, text: JSON.stringify(snapshot, null, 2) }] };
  }
);

server.tool(
  'report_compare_months',
  'Compare two monthly snapshots and return metric changes with percentages',
  ReportCompareMonthsInputSchema.shape,
  async ({ currentPeriod, previousPeriod }) => {
    const current = await loadSnapshot(currentPeriod);
    const previous = await loadSnapshot(previousPeriod);
    if (!current) {
      return { content: [{ type: 'text' as const, text: `No snapshot found for ${currentPeriod}. Run report_collect_data first.` }], isError: true };
    }
    if (!previous) {
      return { content: [{ type: 'text' as const, text: `No snapshot found for ${previousPeriod}. Run report_collect_data first.` }], isError: true };
    }
    const result = compareMonths(current, previous);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================
// Goals Tools
// ============================================================

server.tool(
  'goals_get_targets',
  'Read the goals.yaml file and return all monthly and quarterly targets',
  GoalsGetTargetsInputSchema.shape,
  async () => {
    const goals = await loadGoals();
    const targets = getGoalTargets(goals);
    return { content: [{ type: 'text' as const, text: JSON.stringify(targets, null, 2) }] };
  }
);

server.tool(
  'goals_compare',
  'Compare actual metrics from a monthly snapshot against goal targets. Shows which goals were hit, missed, or close.',
  GoalsCompareInputSchema.shape,
  async ({ period }) => {
    const snapshot = await loadSnapshot(period);
    if (!snapshot) {
      return { content: [{ type: 'text' as const, text: `No snapshot found for ${period}. Run report_collect_data first.` }], isError: true };
    }
    const goals = await loadGoals();
    const result = compareGoals(period, snapshot, goals);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'goals_health_check',
  'Analyze goal hit-rate over the last N months and suggest adjustments',
  GoalsHealthCheckInputSchema.shape,
  async ({ months }) => {
    const result = await healthCheck(months);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'goals_missing_kpis',
  'Detect goals that have no connected data source — flags gaps in tracking',
  GoalsMissingKPIsInputSchema.shape,
  async () => {
    const goals = await loadGoals();
    const result = findMissingKPIs(goals);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================
// Start Server
// ============================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Marketing Report MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
