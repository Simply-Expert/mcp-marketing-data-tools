import jwt from 'jsonwebtoken';
import fs from 'fs';
import { periodToDateRange } from '../formatters.js';
import { cachedFetch } from '../cache.js';
import { getRatesForPeriod } from '../currency.js';
import type {
  AppStoreDownloads,
  AppStoreRevenue,
  AppStoreReviews,
  AppStoreReview,
  AppStoreRatings,
  AppStoreCountryRating,
  AppStoreSalesRow,
} from '../types.js';

interface AppStoreConfig {
  issuerId: string;
  keyId: string;
  privateKey: string;
  vendorNumber: string;
  appId: string;
}

export class AppStoreClient {
  private config: AppStoreConfig;

  constructor() {
    const privateKeyPath = process.env.APPSTORE_PRIVATE_KEY_PATH;
    if (!privateKeyPath) throw new Error('APPSTORE_PRIVATE_KEY_PATH is not set');

    const issuerId = process.env.APPSTORE_ISSUER_ID;
    const keyId = process.env.APPSTORE_KEY_ID;
    const vendorNumber = process.env.APPSTORE_VENDOR_NUMBER;
    const appId = process.env.APPSTORE_APP_ID;

    if (!issuerId || !keyId || !vendorNumber || !appId) {
      throw new Error('Missing App Store Connect config: APPSTORE_ISSUER_ID, APPSTORE_KEY_ID, APPSTORE_VENDOR_NUMBER, APPSTORE_APP_ID');
    }

    this.config = {
      issuerId,
      keyId,
      privateKey: fs.readFileSync(privateKeyPath, 'utf8'),
      vendorNumber,
      appId,
    };
  }

  /** Generate a JWT for App Store Connect API */
  private generateToken(): string {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.config.issuerId,
      iat: now,
      exp: now + 1200, // 20 minutes
      aud: 'appstoreconnect-v1',
    };

    return jwt.sign(payload, this.config.privateKey, {
      algorithm: 'ES256',
      header: {
        alg: 'ES256',
        kid: this.config.keyId,
        typ: 'JWT',
      },
    });
  }

  /** Make an authenticated request to App Store Connect API */
  private async apiRequest(url: string): Promise<Response> {
    const token = this.generateToken();
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`App Store API error ${response.status}: ${text}`);
    }

    return response;
  }

  /** Request a sales report from App Store Connect (returns TSV) */
  private async getSalesReport(period: string, reportType: string, reportSubType: string): Promise<string> {
    // Sales reports use YYYY-MM format for monthly
    const url = new URL('https://api.appstoreconnect.apple.com/v1/salesReports');
    url.searchParams.set('filter[vendorNumber]', this.config.vendorNumber);
    url.searchParams.set('filter[reportType]', reportType);
    url.searchParams.set('filter[reportSubType]', reportSubType);
    url.searchParams.set('filter[frequency]', 'MONTHLY');
    url.searchParams.set('filter[reportDate]', period);

    const token = this.generateToken();
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/a-gzip',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Sales report error ${response.status}: ${text}`);
    }

    // Response is gzip-compressed TSV
    const buffer = await response.arrayBuffer();
    const decompressed = await decompress(new Uint8Array(buffer));
    return new TextDecoder().decode(decompressed);
  }

  /** Get raw parsed sales report rows, cached. Optionally filter by product type ID. */
  async getSalesRows(period: string, productType?: string): Promise<AppStoreSalesRow[]> {
    const allRows = await cachedFetch<AppStoreSalesRow[]>(
      'appstore', 'sales-report', period,
      () => this.fetchSalesRows(period),
    );

    if (!productType) return allRows;
    return allRows.filter(row => row.productTypeId === productType);
  }

  private async fetchSalesRows(period: string): Promise<AppStoreSalesRow[]> {
    const tsv = await this.getSalesReport(period, 'SALES', 'SUMMARY');
    const lines = tsv.trim().split('\n');
    const headers = lines[0].split('\t');

    const idx = (name: string) => headers.indexOf(name);
    const rows: AppStoreSalesRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      rows.push({
        productTypeId: cols[idx('Product Type Identifier')] || '',
        units: parseInt(cols[idx('Units')], 10) || 0,
        developerProceeds: parseFloat(cols[idx('Developer Proceeds')]) || 0,
        proceedsCurrency: cols[idx('Currency of Proceeds')] || '',
        customerPrice: parseFloat(cols[idx('Customer Price')]) || 0,
        customerCurrency: cols[idx('Customer Currency')] || '',
        countryCode: cols[idx('Country Code')] || '',
        appleId: cols[idx('Apple Identifier')] || '',
        title: cols[idx('Title')] || '',
        sku: cols[idx('SKU')] || '',
        parentId: cols[idx('Parent Identifier')] || '',
        subscription: cols[idx('Subscription')] || '',
        subscriptionPeriod: cols[idx('Period')] || '',
        proceedsReason: cols[idx('Proceeds Reason')] || '',
        orderType: cols[idx('Order Type')] || '',
        device: cols[idx('Device')] || '',
        promoCode: cols[idx('Promo Code')] || '',
      });
    }

    return rows;
  }

  async getDownloads(period: string, byCountry = false): Promise<AppStoreDownloads> {
    // Always fetch with country breakdown (superset), cache once
    const full = await cachedFetch<AppStoreDownloads>(
      'appstore', 'downloads', period,
      () => this.fetchDownloads(period),
    );

    if (byCountry) return full;
    // Strip country breakdown if not requested
    const { byCountry: _, ...rest } = full as AppStoreDownloads & { byCountry?: Record<string, number> };
    return rest;
  }

  private async fetchDownloads(period: string): Promise<AppStoreDownloads> {
    const rows = await this.getSalesRows(period);

    let totalDownloads = 0;
    const countryCounts: Record<string, number> = {};

    for (const row of rows) {
      if (row.appleId !== this.config.appId || row.productTypeId !== '1F') continue;

      totalDownloads += row.units;
      if (row.countryCode) {
        countryCounts[row.countryCode] = (countryCounts[row.countryCode] ?? 0) + row.units;
      }
    }

    return {
      period,
      totalDownloads,
      byCountry: countryCounts,
    };
  }

  async getRevenue(period: string, type: 'proceeds' | 'grossSales' = 'proceeds'): Promise<AppStoreRevenue> {
    const cacheKey = type === 'grossSales' ? 'revenue-gross' : 'revenue';
    return cachedFetch<AppStoreRevenue>(
      'appstore', cacheKey, period,
      () => this.fetchRevenue(period, type),
    );
  }

  private async fetchRevenue(period: string, type: 'proceeds' | 'grossSales' = 'proceeds'): Promise<AppStoreRevenue> {
    const rows = await this.getSalesRows(period);
    const useGross = type === 'grossSales';

    const productItems: Array<{ productName: string; amount: number; currency: string }> = [];

    for (const row of rows) {
      const isAppRow = row.appleId === this.config.appId;
      const isSubscriptionRow = row.productTypeId === 'IAY' && row.parentId.trim() !== '';

      if (!isAppRow && !isSubscriptionRow) continue;

      const perUnit = useGross ? row.customerPrice : row.developerProceeds;
      const units = row.units;
      const revenue = perUnit * units;
      if (revenue === 0) continue;

      const currency = useGross ? row.customerCurrency : row.proceedsCurrency;
      const productName = row.title || row.appleId;

      productItems.push({ productName, amount: revenue, currency: currency || 'USD' });
    }

    // Convert all amounts to USD
    const byProduct: Record<string, number> = {};
    let totalRevenue = 0;

    if (productItems.length > 0) {
      const snapshot = await getRatesForPeriod(period);

      for (const item of productItems) {
        let usdAmount: number;
        if (item.currency === 'USD') {
          usdAmount = item.amount;
        } else {
          const rate = snapshot.rates[item.currency];
          if (!rate) {
            // Skip rows with unknown currencies rather than failing
            continue;
          }
          usdAmount = item.amount / rate;
        }
        totalRevenue += usdAmount;
        byProduct[item.productName] = (byProduct[item.productName] ?? 0) + usdAmount;
      }
    }

    // Round to 2 decimal places
    totalRevenue = Math.round(totalRevenue * 100) / 100;
    for (const key of Object.keys(byProduct)) {
      byProduct[key] = Math.round(byProduct[key] * 100) / 100;
    }

    return {
      period,
      totalRevenue,
      currency: 'USD',
      byProduct,
    };
  }

  async getReviews(period: string, limit = 20): Promise<AppStoreReviews> {
    // Always fetch max batch (100) for cache, then trim to requested limit
    const full = await cachedFetch<AppStoreReviews>(
      'appstore', 'reviews', period,
      () => this.fetchReviews(period, 100),
    );

    if (limit >= full.reviews.length) return full;
    return {
      ...full,
      reviews: full.reviews.slice(0, limit),
    };
  }

  private async fetchReviews(period: string, limit: number): Promise<AppStoreReviews> {
    const url = `https://api.appstoreconnect.apple.com/v1/apps/${this.config.appId}/customerReviews?sort=-createdDate&limit=${limit}`;
    const response = await this.apiRequest(url);
    const data = await response.json() as {
      data: Array<{
        id: string;
        attributes: {
          title?: string;
          body?: string;
          rating: number;
          reviewerNickname?: string;
          createdDate: string;
          territory: string;
        };
      }>;
    };

    const { startDate, endDate } = periodToDateRange(period);
    const reviews: AppStoreReview[] = [];

    for (const item of data.data) {
      const date = item.attributes.createdDate;
      if (date >= startDate && date <= endDate + 'T23:59:59Z') {
        reviews.push({
          id: item.id,
          title: item.attributes.title ?? '',
          body: item.attributes.body ?? '',
          rating: item.attributes.rating,
          author: item.attributes.reviewerNickname ?? 'Anonymous',
          date: item.attributes.createdDate,
          territory: item.attributes.territory,
        });
      }
    }

    return {
      period,
      reviews,
      totalCount: reviews.length,
    };
  }

  async getRatings(period: string): Promise<AppStoreRatings> {
    return cachedFetch<AppStoreRatings>(
      'appstore', 'ratings', period,
      () => this.fetchRatings(period),
    );
  }

  /** Top countries to query for iTunes Lookup ratings */
  private static readonly RATING_COUNTRIES = [
    'sa', 'us', 'ae', 'eg', 'kw', 'il', 'om', 'de', 'bh', 'jo',
    'gb', 'fr', 'se', 'nl', 'ca', 'au', 'tr', 'dz', 'ma', 'iq',
    'qa', 'ly', 'ye', 'lb', 'it', 'no', 'be', 'dk', 'ch', 'es',
  ];

  private async fetchRatings(period: string): Promise<AppStoreRatings> {
    // 1. Get real rating counts from iTunes Lookup API (includes star-only ratings)
    const countryRatings = await this.fetchItunesLookupRatings();

    // 2. Get review-based distribution (text reviews only) for the period
    const reviewsResult = await this.getReviews(period, 100);
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const review of reviewsResult.reviews) {
      distribution[review.rating] = (distribution[review.rating] ?? 0) + 1;
    }

    // 3. Compute weighted average from iTunes Lookup data
    let totalWeightedRating = 0;
    let totalRatings = 0;
    for (const cr of countryRatings) {
      totalWeightedRating += cr.averageRating * cr.ratingCount;
      totalRatings += cr.ratingCount;
    }
    const averageRating = totalRatings > 0 ? totalWeightedRating / totalRatings : 0;

    return {
      period,
      averageRating: Math.round(averageRating * 100) / 100,
      totalRatings,
      distribution,
      byCountry: countryRatings.filter(c => c.ratingCount > 0),
      source: countryRatings.length > 0 ? 'itunes_lookup' : 'reviews_only',
      note: 'totalRatings and averageRating are cumulative all-time from iTunes Lookup (includes star-only ratings). distribution is from text reviews for the given period only.',
    };
  }

  /** Fetch ratings from the iTunes Lookup API for all key countries */
  private async fetchItunesLookupRatings(): Promise<AppStoreCountryRating[]> {
    const results: AppStoreCountryRating[] = [];

    // Fetch all countries in parallel with a concurrency limit
    const batchSize = 10;
    for (let i = 0; i < AppStoreClient.RATING_COUNTRIES.length; i += batchSize) {
      const batch = AppStoreClient.RATING_COUNTRIES.slice(i, i + batchSize);
      const promises = batch.map(async (cc) => {
        try {
          const url = `https://itunes.apple.com/${cc}/lookup?id=${this.config.appId}`;
          const response = await fetch(url);
          if (!response.ok) return null;
          const data = await response.json() as {
            resultCount: number;
            results: Array<{
              averageUserRating?: number;
              userRatingCount?: number;
              averageUserRatingForCurrentVersion?: number;
              userRatingCountForCurrentVersion?: number;
            }>;
          };
          if (data.resultCount === 0 || !data.results[0]) return null;
          const app = data.results[0];
          const avg = app.averageUserRating ?? app.averageUserRatingForCurrentVersion ?? 0;
          const count = app.userRatingCount ?? app.userRatingCountForCurrentVersion ?? 0;
          if (count === 0) return null;
          return { country: cc.toUpperCase(), averageRating: avg, ratingCount: count };
        } catch {
          return null;
        }
      });
      const batchResults = await Promise.all(promises);
      for (const r of batchResults) {
        if (r) results.push(r);
      }
    }

    return results;
  }
}

/** Decompress gzip data using Node.js zlib */
async function decompress(data: Uint8Array): Promise<Buffer> {
  const { gunzipSync } = await import('zlib');
  return gunzipSync(Buffer.from(data));
}
