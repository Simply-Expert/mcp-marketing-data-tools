import { z } from 'zod';

/** Shared period schema: YYYY-MM format */
export const PeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Period must be YYYY-MM format with valid month (01-12)');

// ============================================================
// Stripe Schemas
// ============================================================

export const StripeMRRInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

export const StripeSubscriptionsInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

export const StripeChurnInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

export const StripeRevenueByPlanInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

export const StripeRevenueInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

export const StripeRevenueByCountryInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

export const StripeRevenueByTypeInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format');

export const StripeDailyRevenueInputSchema = z.object({
  start_date: DateSchema.describe('Start date in YYYY-MM-DD format'),
  end_date: DateSchema.describe('End date in YYYY-MM-DD format'),
});

// ============================================================
// App Store Schemas
// ============================================================

export const AppStoreDownloadsInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
  byCountry: z.boolean().optional().default(false).describe('Include country breakdown'),
});

export const AppStoreRevenueInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
  type: z.enum(['proceeds', 'grossSales']).optional().default('proceeds')
    .describe('proceeds = after Apple commission (default), grossSales = customer price before commission'),
});

export const AppStoreReviewsInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
  limit: z.number().optional().default(20).describe('Max reviews to return'),
});

export const AppStoreRatingsInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

export const AppStoreSalesReportInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
  productType: z.string().optional().describe('Filter by Product Type ID, e.g. "IAY" for subscriptions, "1F" for first-time downloads'),
});

// ============================================================
// Google Play Schemas
// ============================================================

export const PlayStoreDownloadsInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
  byCountry: z.boolean().optional().default(false).describe('Include country breakdown'),
});

export const PlayStoreRevenueInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

export const PlayStoreReviewsInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
  limit: z.number().optional().default(20).describe('Max reviews to return'),
});

export const PlayStoreStabilityInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

// ============================================================
// Meta Schemas (Organic Social + Ads)
// ============================================================

export const MetaPageInsightsInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

export const MetaInstagramInsightsInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

export const MetaInstagramPostsInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
  limit: z.number().optional().default(20).describe('Max posts to return'),
});

export const MetaFacebookVideoPostsInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

export const MetaInstagramVideoPostsInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

export const MetaAdSpendInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

export const MetaAdPerformanceInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

export const MetaAdConversionsInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

export const MetaAdPerformanceByCountryInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

// ============================================================
// Google Search Console Schemas
// ============================================================

export const GscOverviewInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

export const GscTopQueriesInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
  limit: z.number().optional().default(20).describe('Max queries to return'),
});

export const GscTopPagesInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
  limit: z.number().optional().default(20).describe('Max pages to return'),
});

export const GscByCountryInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

export const GscByDeviceInputSchema = z.object({
  period: PeriodSchema.describe('Month to query in YYYY-MM format'),
});

// ============================================================
// Report Schemas
// ============================================================

export const ReportCollectDataInputSchema = z.object({
  period: PeriodSchema.describe('Month to collect data for in YYYY-MM format'),
});

export const ReportCompareMonthsInputSchema = z.object({
  currentPeriod: PeriodSchema.describe('Current month in YYYY-MM format'),
  previousPeriod: PeriodSchema.describe('Previous month in YYYY-MM format'),
});

// ============================================================
// Goals Schemas
// ============================================================

export const GoalsGetTargetsInputSchema = z.object({});

export const GoalsCompareInputSchema = z.object({
  period: PeriodSchema.describe('Month to compare against goals in YYYY-MM format'),
});

export const GoalsHealthCheckInputSchema = z.object({
  months: z.number().optional().default(3).describe('Number of past months to analyze'),
});

export const GoalsMissingKPIsInputSchema = z.object({});
