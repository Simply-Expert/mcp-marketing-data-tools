// ============================================================
// Core types for the Marketing Report MCP Server
// ============================================================

/** Date range for data queries */
export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

/** Standard period identifier */
export type Period = string; // YYYY-MM format

// ============================================================
// Stripe Types
// ============================================================

export interface StripeMRR {
  period: Period;
  mrr: number;
  currency: string;
  activeSubscriptions: number;
}

export interface StripeSubscriptions {
  period: Period;
  new: number;
  active: number;
  canceled: number;
  pastDue: number;
}

export interface StripeChurn {
  period: Period;
  churnRate: number;
  canceledCount: number;
  startingCount: number;
}

export interface StripeRevenuePlan {
  planId: string;
  planName: string;
  revenue: number;
  subscriptionCount: number;
  currency: string;
}

export interface StripeRevenueByPlan {
  period: Period;
  plans: StripeRevenuePlan[];
  totalRevenue: number;
  currency: string;
}

export interface StripeRevenue {
  period: Period;
  totalRevenue: number;
  totalFees: number;
  netRevenue: number;
  chargeCount: number;
  currency: string;
}

export interface StripeRevenueCountryEntry {
  country: string;
  revenue: number;
  chargeCount: number;
}

export interface StripeRevenueByCountry {
  period: Period;
  countries: StripeRevenueCountryEntry[];
  totalRevenue: number;
  currency: string;
}

export interface StripeRevenueByType {
  period: Period;
  newRevenue: number;
  renewalRevenue: number;
  otherRevenue: number;
  newCharges: number;
  renewalCharges: number;
  otherCharges: number;
  totalRevenue: number;
  currency: string;
}

export interface StripeDailyRevenueEntry {
  date: string; // YYYY-MM-DD
  revenue: number;
  fees: number;
  netRevenue: number;
  chargeCount: number;
  newSubscriptions: number;
  renewals: number;
}

export interface StripeDailyRevenue {
  startDate: string;
  endDate: string;
  days: StripeDailyRevenueEntry[];
  totals: {
    revenue: number;
    fees: number;
    netRevenue: number;
    chargeCount: number;
    newSubscriptions: number;
    renewals: number;
  };
  currency: string;
}

// ============================================================
// App Store Types
// ============================================================

export interface AppStoreDownloads {
  period: Period;
  totalDownloads: number;
  byCountry?: Record<string, number>;
}

export interface AppStoreRevenue {
  period: Period;
  totalRevenue: number;
  currency: string;
  byProduct?: Record<string, number>;
}

export interface AppStoreReview {
  id: string;
  title: string;
  body: string;
  rating: number;
  author: string;
  date: string;
  territory: string;
}

export interface AppStoreReviews {
  period: Period;
  reviews: AppStoreReview[];
  totalCount: number;
}

export interface AppStoreCountryRating {
  country: string;
  averageRating: number;
  ratingCount: number;
}

export interface AppStoreRatings {
  period: Period;
  averageRating: number;
  totalRatings: number;
  distribution: Record<number, number>; // 1-5 star counts (from text reviews only)
  byCountry?: AppStoreCountryRating[];
  source: 'itunes_lookup' | 'reviews_only';
  note?: string;
}

export interface AppStoreSalesRow {
  productTypeId: string;      // "1F", "3F", "7F", "IAY"
  units: number;
  developerProceeds: number;  // per-unit, local currency
  proceedsCurrency: string;
  customerPrice: number;
  customerCurrency: string;
  countryCode: string;
  appleId: string;
  title: string;
  sku: string;
  parentId: string;
  subscription: string;       // "New" | "Renewal" | ""
  subscriptionPeriod: string; // "1 Month", "7 Days", etc.
  proceedsReason: string;     // "" | "Rate After One Year"
  orderType: string;          // "" | "Free Trial Intro Offer" | "Pay Up Front Intro Offer"
  device: string;
  promoCode: string;
}

// ============================================================
// Google Play Types
// ============================================================

export interface PlayStoreDownloads {
  period: Period;
  totalDownloads: number;
  byCountry?: Record<string, number>;
}

export interface PlayStoreRevenue {
  period: Period;
  totalRevenue: number;
  currency: string;
}

export interface PlayStoreReview {
  reviewId: string;
  text: string;
  rating: number;
  author: string;
  date: string;
  language: string;
  replyText?: string;
  replyDate?: string;
}

export interface PlayStoreReviews {
  period: Period;
  reviews: PlayStoreReview[];
  totalCount: number;
}

export interface PlayStoreStability {
  period: Period;
  crashRate: number;
  anrRate: number;
  crashFreeRate: number | null;
  totalCrashes: number;
  totalAnrs: number;
}

// ============================================================
// Meta Types (Organic Social + Ads)
// ============================================================

export interface MetaPageInsights {
  pageId: string;
  pageName: string;
  totalImpressions: number;
  totalReach: number;
  engagedUsers: number;
  pageFans: number;
  pageFansGrowth: number;
  newLikes: number;
  unlikes: number;
  videoViews: number;
}

export interface MetaInstagramInsights {
  igUserId: string;
  username: string;
  followersCount: number;
  followersGrowth: number;
  totalImpressions: number;
  totalReach: number;
  profileViews: number;
  websiteClicks: number;
}

export interface MetaInstagramPost {
  id: string;
  caption: string;
  mediaType: string;
  permalink: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
  reach: number;
  impressions: number;
  saved: number;
  shares: number;
  engagement: number;
}

export interface MetaInstagramPosts {
  posts: MetaInstagramPost[];
  totalCount: number;
  averageEngagement: number;
  engagementRate: number;
  totalVideoViews: number;
}

export interface MetaVideoPost {
  id: string;
  date: string;
  title: string;
  views: number;
  link: string;
}

export interface MetaFacebookVideoPosts {
  period: Period;
  videos: MetaVideoPost[];
  totalViews: number;
}

export interface MetaInstagramVideoPost {
  id: string;
  date: string;
  title: string;
  views: number;
  link: string;
  likes: number;
  comments: number;
}

export interface MetaInstagramVideoPosts {
  period: Period;
  videos: MetaInstagramVideoPost[];
  totalViews: number;
}

export interface MetaAdSpend {
  totalSpend: number;
  currency: string;
  impressions: number;
  reach: number;
}

export interface MetaCampaignPerformance {
  campaignId: string;
  campaignName: string;
  objective: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
}

export interface MetaAdPerformance {
  campaigns: MetaCampaignPerformance[];
  totals: {
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
  };
  currency: string;
}

export interface MetaAdConversions {
  totalSpend: number;
  totalConversions: number;
  totalConversionValue: number;
  roas: number;
  cpa: number;
  conversionsByType: Record<string, number>;
  currency: string;
}

export interface MetaAdCountryEntry {
  country: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpa: number;
}

export interface MetaAdPerformanceByCountry {
  countries: MetaAdCountryEntry[];
  totalSpend: number;
  currency: string;
}

// ============================================================
// Google Search Console Types
// ============================================================

export interface SearchConsoleRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsoleOverview {
  period: Period;
  totalClicks: number;
  totalImpressions: number;
  averageCtr: number;
  averagePosition: number;
}

export interface SearchConsoleQueryEntry {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsoleTopQueries {
  period: Period;
  queries: SearchConsoleQueryEntry[];
}

export interface SearchConsolePageEntry {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsoleTopPages {
  period: Period;
  pages: SearchConsolePageEntry[];
}

export interface SearchConsoleCountryEntry {
  country: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsoleByCountry {
  period: Period;
  countries: SearchConsoleCountryEntry[];
}

export interface SearchConsoleDeviceEntry {
  device: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsoleByDevice {
  period: Period;
  devices: SearchConsoleDeviceEntry[];
}

// ============================================================
// Report / Snapshot Types
// ============================================================

export interface PlatformError {
  platform: string;
  error: string;
  timestamp: string;
}

export interface MonthlySnapshot {
  period: Period;
  collectedAt: string;
  stripe?: {
    mrr: StripeMRR;
    subscriptions: StripeSubscriptions;
    churn: StripeChurn;
    revenueByPlan: StripeRevenueByPlan;
  };
  appStore?: {
    downloads: AppStoreDownloads;
    revenue: AppStoreRevenue;
    reviews: AppStoreReviews;
    ratings: AppStoreRatings;
  };
  playStore?: {
    downloads: PlayStoreDownloads;
    revenue: PlayStoreRevenue;
    reviews: PlayStoreReviews;
    stability: PlayStoreStability;
  };
  metaOrganic?: {
    pageInsights: MetaPageInsights;
    instagramInsights: MetaInstagramInsights;
    instagramPosts: MetaInstagramPosts;
    facebookVideoPosts: MetaFacebookVideoPosts;
    instagramVideoPosts: MetaInstagramVideoPosts;
  };
  metaAds?: {
    spend: MetaAdSpend;
    performance: MetaAdPerformance;
    conversions: MetaAdConversions;
  };
  searchConsole?: {
    overview: SearchConsoleOverview;
    topQueries: SearchConsoleTopQueries;
    topPages: SearchConsoleTopPages;
  };
  errors: PlatformError[];
}

// ============================================================
// Month-over-Month Comparison
// ============================================================

export interface MetricChange {
  metric: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
}

export interface MonthComparison {
  currentPeriod: Period;
  previousPeriod: Period;
  changes: MetricChange[];
}

// ============================================================
// Goals Types
// ============================================================

export interface GoalTarget {
  key: string;
  label: string;
  target: number;
  category: string;
}

export interface GoalComparison {
  key: string;
  label: string;
  target: number;
  actual: number | null;
  difference: number | null;
  percentDiff: number | null;
  status: 'hit' | 'miss' | 'close' | 'no_data';
  category: string;
}

export interface GoalsComparisonResult {
  period: Period;
  comparisons: GoalComparison[];
  summary: {
    total: number;
    hit: number;
    miss: number;
    close: number;
    noData: number;
  };
}

export interface GoalHealthEntry {
  key: string;
  label: string;
  hitCount: number;
  totalMonths: number;
  hitRate: number;
  recommendation: string;
}

export interface GoalHealthCheck {
  months: number;
  entries: GoalHealthEntry[];
}

export interface MissingKPI {
  key: string;
  label: string;
  target: number;
  reason: string;
}

export interface MissingKPIsResult {
  missing: MissingKPI[];
}

// ============================================================
// Goals YAML Schema
// ============================================================

export interface GoalsYAML {
  monthly_targets: {
    downloads?: {
      ios?: number;
      android?: number;
      total?: number;
    };
    revenue?: {
      mrr?: number;
      app_revenue?: number;
    };
    subscriptions?: {
      new_subscribers?: number;
      churn_rate?: number;
    };
    paid_acquisition?: {
      total_spend?: number;
      blended_roas?: number;
      cpa?: number;
    };
    organic_social?: {
      instagram_followers_growth?: number;
      engagement_rate?: number;
    };
    app_health?: {
      ios_rating?: number;
      android_rating?: number;
      crash_free_rate?: number;
    };
    organic_search?: {
      total_clicks?: number;
      average_ctr?: number;
      average_position?: number;
    };
  };
  quarterly_targets?: {
    total_subscribers?: number;
    annual_revenue?: number;
  };
  notes?: string[];
}
