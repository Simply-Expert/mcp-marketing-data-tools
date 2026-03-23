import type { MonthlySnapshot, PlatformError } from '../types.js';
import type { StripeClient } from '../clients/stripe.js';
import type { AppStoreClient } from '../clients/appstore.js';
import type { PlayStoreClient } from '../clients/playstore.js';
import type { MetaClient } from '../clients/meta.js';
import type { SearchConsoleClient } from '../clients/searchconsole.js';
import { saveSnapshot } from './snapshot.js';

interface Clients {
  stripe: StripeClient;
  appStore: AppStoreClient;
  playStore: PlayStoreClient;
  meta: MetaClient;
  gsc?: SearchConsoleClient;
}

export async function collectData(period: string, clients: Clients): Promise<MonthlySnapshot> {
  const errors: PlatformError[] = [];
  const snapshot: MonthlySnapshot = {
    period,
    collectedAt: new Date().toISOString(),
    errors,
  };

  // Stripe
  try {
    const [mrr, subscriptions, churn, revenueByPlan] = await Promise.all([
      clients.stripe.getMRR(period),
      clients.stripe.getSubscriptions(period),
      clients.stripe.getChurn(period),
      clients.stripe.getRevenueByPlan(period),
    ]);
    snapshot.stripe = { mrr, subscriptions, churn, revenueByPlan };
  } catch (error) {
    errors.push({
      platform: 'stripe',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }

  // App Store
  try {
    const [downloads, revenue, reviews, ratings] = await Promise.all([
      clients.appStore.getDownloads(period, true),
      clients.appStore.getRevenue(period),
      clients.appStore.getReviews(period),
      clients.appStore.getRatings(period),
    ]);
    snapshot.appStore = { downloads, revenue, reviews, ratings };
  } catch (error) {
    errors.push({
      platform: 'appStore',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }

  // Play Store
  try {
    const [downloads, revenue, reviews, stability] = await Promise.all([
      clients.playStore.getDownloads(period, true),
      clients.playStore.getRevenue(period),
      clients.playStore.getReviews(period),
      clients.playStore.getStability(period),
    ]);
    snapshot.playStore = { downloads, revenue, reviews, stability };
  } catch (error) {
    errors.push({
      platform: 'playStore',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }

  // Meta Organic
  try {
    const [pageInsights, instagramInsights, instagramPosts, facebookVideoPosts, instagramVideoPosts] = await Promise.all([
      clients.meta.getPageInsights(period),
      clients.meta.getInstagramInsights(period),
      clients.meta.getInstagramPosts(period),
      clients.meta.getFacebookVideoPosts(period),
      clients.meta.getInstagramVideoPosts(period),
    ]);
    snapshot.metaOrganic = { pageInsights, instagramInsights, instagramPosts, facebookVideoPosts, instagramVideoPosts };
  } catch (error) {
    errors.push({
      platform: 'metaOrganic',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }

  // Meta Ads
  try {
    const [spend, performance, conversions] = await Promise.all([
      clients.meta.getAdSpend(period),
      clients.meta.getAdPerformance(period),
      clients.meta.getAdConversions(period),
    ]);
    snapshot.metaAds = { spend, performance, conversions };
  } catch (error) {
    errors.push({
      platform: 'metaAds',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }

  // Search Console
  if (clients.gsc) {
    try {
      const [overview, topQueries, topPages] = await Promise.all([
        clients.gsc.getOverview(period),
        clients.gsc.getTopQueries(period),
        clients.gsc.getTopPages(period),
      ]);
      snapshot.searchConsole = { overview, topQueries, topPages };
    } catch (error) {
      errors.push({
        platform: 'searchConsole',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Save snapshot
  await saveSnapshot(snapshot);

  return snapshot;
}
