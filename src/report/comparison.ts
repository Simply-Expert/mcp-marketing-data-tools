import type { MonthlySnapshot, MonthComparison, MetricChange } from '../types.js';

export function compareMonths(current: MonthlySnapshot, previous: MonthlySnapshot): MonthComparison {
  const changes: MetricChange[] = [];

  function addChange(metric: string, currentVal: number | undefined, previousVal: number | undefined) {
    const c = currentVal ?? 0;
    const p = previousVal ?? 0;
    const change = c - p;
    const changePercent = p !== 0 ? (change / p) * 100 : (c !== 0 ? 100 : 0);

    changes.push({
      metric,
      current: c,
      previous: p,
      change,
      changePercent: Math.round(changePercent * 100) / 100,
    });
  }

  // Stripe metrics
  addChange('MRR', current.stripe?.mrr.mrr, previous.stripe?.mrr.mrr);
  addChange('Active Subscriptions', current.stripe?.mrr.activeSubscriptions, previous.stripe?.mrr.activeSubscriptions);
  addChange('New Subscriptions', current.stripe?.subscriptions.new, previous.stripe?.subscriptions.new);
  addChange('Canceled Subscriptions', current.stripe?.subscriptions.canceled, previous.stripe?.subscriptions.canceled);
  addChange('Churn Rate', current.stripe?.churn.churnRate, previous.stripe?.churn.churnRate);
  addChange('Stripe Revenue', current.stripe?.revenueByPlan.totalRevenue, previous.stripe?.revenueByPlan.totalRevenue);

  // App Store metrics
  addChange('iOS Downloads', current.appStore?.downloads.totalDownloads, previous.appStore?.downloads.totalDownloads);
  addChange('iOS Revenue', current.appStore?.revenue.totalRevenue, previous.appStore?.revenue.totalRevenue);
  addChange('iOS Average Rating', current.appStore?.ratings.averageRating, previous.appStore?.ratings.averageRating);
  addChange('iOS Review Count', current.appStore?.ratings.totalRatings, previous.appStore?.ratings.totalRatings);

  // Play Store metrics
  addChange('Android Downloads', current.playStore?.downloads.totalDownloads, previous.playStore?.downloads.totalDownloads);
  addChange('Android Revenue', current.playStore?.revenue.totalRevenue, previous.playStore?.revenue.totalRevenue);
  addChange('Android Crash-Free Rate', current.playStore?.stability?.crashFreeRate ?? undefined, previous.playStore?.stability?.crashFreeRate ?? undefined);
  addChange('Android Total Crashes', current.playStore?.stability?.totalCrashes, previous.playStore?.stability?.totalCrashes);

  // Meta Organic metrics
  addChange('Instagram Followers', current.metaOrganic?.instagramInsights.followersCount, previous.metaOrganic?.instagramInsights.followersCount);
  addChange('Instagram Follower Growth', current.metaOrganic?.instagramInsights.followersGrowth, previous.metaOrganic?.instagramInsights.followersGrowth);
  addChange('Instagram Impressions', current.metaOrganic?.instagramInsights.totalImpressions, previous.metaOrganic?.instagramInsights.totalImpressions);
  addChange('Instagram Reach', current.metaOrganic?.instagramInsights.totalReach, previous.metaOrganic?.instagramInsights.totalReach);
  addChange('Instagram Engagement Rate', current.metaOrganic?.instagramPosts.engagementRate, previous.metaOrganic?.instagramPosts.engagementRate);
  addChange('Instagram Video Views', current.metaOrganic?.instagramVideoPosts.totalViews, previous.metaOrganic?.instagramVideoPosts.totalViews);
  addChange('Instagram Video Count', current.metaOrganic?.instagramVideoPosts.videos.length, previous.metaOrganic?.instagramVideoPosts.videos.length);
  addChange('Facebook Video Views', current.metaOrganic?.facebookVideoPosts.totalViews, previous.metaOrganic?.facebookVideoPosts.totalViews);
  addChange('Facebook Video Count', current.metaOrganic?.facebookVideoPosts.videos.length, previous.metaOrganic?.facebookVideoPosts.videos.length);
  addChange('Facebook Page Fans', current.metaOrganic?.pageInsights.pageFans, previous.metaOrganic?.pageInsights.pageFans);
  addChange('Facebook Page Impressions', current.metaOrganic?.pageInsights.totalImpressions, previous.metaOrganic?.pageInsights.totalImpressions);

  // Meta Ads metrics
  addChange('Ad Spend', current.metaAds?.spend.totalSpend, previous.metaAds?.spend.totalSpend);
  addChange('Ad Impressions', current.metaAds?.spend.impressions, previous.metaAds?.spend.impressions);
  addChange('Ad Clicks', current.metaAds?.performance.totals.clicks, previous.metaAds?.performance.totals.clicks);
  addChange('Ad CTR', current.metaAds?.performance.totals.ctr, previous.metaAds?.performance.totals.ctr);
  addChange('Ad CPC', current.metaAds?.performance.totals.cpc, previous.metaAds?.performance.totals.cpc);
  addChange('Ad ROAS', current.metaAds?.conversions.roas, previous.metaAds?.conversions.roas);
  addChange('Ad CPA', current.metaAds?.conversions.cpa, previous.metaAds?.conversions.cpa);
  addChange('Ad Conversions', current.metaAds?.conversions.totalConversions, previous.metaAds?.conversions.totalConversions);

  // Search Console metrics
  addChange('GSC Clicks', current.searchConsole?.overview.totalClicks, previous.searchConsole?.overview.totalClicks);
  addChange('GSC Impressions', current.searchConsole?.overview.totalImpressions, previous.searchConsole?.overview.totalImpressions);
  addChange('GSC Average CTR', current.searchConsole?.overview.averageCtr, previous.searchConsole?.overview.averageCtr);
  addChange('GSC Average Position', current.searchConsole?.overview.averagePosition, previous.searchConsole?.overview.averagePosition);

  // Combined metrics
  const currentTotalDownloads = (current.appStore?.downloads.totalDownloads ?? 0) + (current.playStore?.downloads.totalDownloads ?? 0);
  const previousTotalDownloads = (previous.appStore?.downloads.totalDownloads ?? 0) + (previous.playStore?.downloads.totalDownloads ?? 0);
  addChange('Total Downloads', currentTotalDownloads, previousTotalDownloads);

  const currentTotalRevenue = (current.appStore?.revenue.totalRevenue ?? 0) + (current.playStore?.revenue.totalRevenue ?? 0);
  const previousTotalRevenue = (previous.appStore?.revenue.totalRevenue ?? 0) + (previous.playStore?.revenue.totalRevenue ?? 0);
  addChange('Total App Revenue', currentTotalRevenue, previousTotalRevenue);

  return {
    currentPeriod: current.period,
    previousPeriod: previous.period,
    changes,
  };
}
