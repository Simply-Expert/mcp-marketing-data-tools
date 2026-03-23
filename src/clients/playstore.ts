import { google, type androidpublisher_v3, type storage_v1 } from 'googleapis';
import { periodToDateRange } from '../formatters.js';
import { cachedFetch } from '../cache.js';
import type {
  PlayStoreDownloads,
  PlayStoreRevenue,
  PlayStoreReviews,
  PlayStoreReview,
  PlayStoreStability,
} from '../types.js';

export class PlayStoreClient {
  private packageName: string;
  private authClient: InstanceType<typeof google.auth.GoogleAuth>;

  constructor() {
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;

    if (!keyPath) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH is not set');
    if (!packageName) throw new Error('GOOGLE_PLAY_PACKAGE_NAME is not set');

    this.packageName = packageName;

    this.authClient = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: [
        'https://www.googleapis.com/auth/androidpublisher',
        'https://www.googleapis.com/auth/devstorage.read_only',
      ],
    });
  }

  private getPlayDeveloper() {
    return google.androidpublisher({
      version: 'v3',
      auth: this.authClient as any,
    });
  }

  private getStorage() {
    return google.storage({
      version: 'v1',
      auth: this.authClient as any,
    });
  }

  async getDownloads(period: string, byCountry = false): Promise<PlayStoreDownloads> {
    // Always fetch with country breakdown (superset), cache once
    const full = await cachedFetch<PlayStoreDownloads>(
      'playstore', 'downloads', period,
      () => this.fetchDownloads(period),
    );

    if (byCountry) return full;
    const { byCountry: _, ...rest } = full as PlayStoreDownloads & { byCountry?: Record<string, number> };
    return rest;
  }

  private async fetchDownloads(period: string): Promise<PlayStoreDownloads> {
    const { startDate, endDate } = periodToDateRange(period);

    const bucketName = process.env.GOOGLE_PLAY_REPORTS_BUCKET;
    if (!bucketName) {
      throw new Error('GOOGLE_PLAY_REPORTS_BUCKET is not set — needed for downloads data');
    }

    const storage = this.getStorage();
    const prefix = `stats/installs/installs_${this.packageName}_`;
    const res = await storage.objects.list({ bucket: bucketName, prefix });
    const objects = res.data.items ?? [];

    const [year, month] = period.split('-');
    const targetFile = objects.find(o => o.name?.includes(`${year}${month}`));

    if (!targetFile?.name) {
      throw new Error(`No install report found for ${period}`);
    }

    const fileRes = await storage.objects.get({
      bucket: bucketName,
      object: targetFile.name,
      alt: 'media',
    });

    const csv = String(fileRes.data);
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',');

    const dateIdx = headers.indexOf('Date');
    const installsIdx = headers.indexOf('Daily Device Installs');
    const countryIdx = headers.indexOf('Country');

    let totalDownloads = 0;
    const countryCounts: Record<string, number> = {};

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const date = cols[dateIdx];

      if (date >= startDate && date <= endDate) {
        const installs = parseInt(cols[installsIdx], 10) || 0;
        totalDownloads += installs;

        if (countryIdx >= 0) {
          const country = cols[countryIdx];
          countryCounts[country] = (countryCounts[country] ?? 0) + installs;
        }
      }
    }

    return {
      period,
      totalDownloads,
      byCountry: countryCounts,
    };
  }

  async getRevenue(period: string): Promise<PlayStoreRevenue> {
    return cachedFetch<PlayStoreRevenue>(
      'playstore', 'revenue', period,
      () => this.fetchRevenue(period),
    );
  }

  private async fetchRevenue(period: string): Promise<PlayStoreRevenue> {
    const bucketName = process.env.GOOGLE_PLAY_REPORTS_BUCKET;
    if (!bucketName) {
      throw new Error('GOOGLE_PLAY_REPORTS_BUCKET is not set — needed for revenue data');
    }

    const storage = this.getStorage();
    const prefix = `earnings/earnings_`;
    const res = await storage.objects.list({ bucket: bucketName, prefix });
    const objects = res.data.items ?? [];

    const [year, month] = period.split('-');
    const targetFile = objects.find(o => o.name?.includes(`${year}${month}`));

    if (!targetFile?.name) {
      throw new Error(`No earnings report found for ${period}`);
    }

    const fileRes = await storage.objects.get({
      bucket: bucketName,
      object: targetFile.name,
      alt: 'media',
    });

    const csv = String(fileRes.data);
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',');

    const amountIdx = headers.indexOf('Amount (Merchant Currency)');
    let totalRevenue = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      totalRevenue += parseFloat(cols[amountIdx]) || 0;
    }

    return {
      period,
      totalRevenue,
      currency: 'USD',
    };
  }

  async getReviews(period: string, limit = 20): Promise<PlayStoreReviews> {
    const full = await cachedFetch<PlayStoreReviews>(
      'playstore', 'reviews', period,
      () => this.fetchReviews(period),
    );

    if (limit >= full.reviews.length) return full;
    return {
      ...full,
      reviews: full.reviews.slice(0, limit),
    };
  }

  private async fetchReviews(period: string): Promise<PlayStoreReviews> {
    const { startDate, endDate } = periodToDateRange(period);
    const playDev = this.getPlayDeveloper();

    const res = await playDev.reviews.list({
      packageName: this.packageName,
    });

    const allReviews = res.data.reviews ?? [];
    const reviews: PlayStoreReview[] = [];

    for (const review of allReviews) {
      if (!review.comments?.[0]?.userComment) continue;

      const userComment = review.comments[0].userComment;
      const timestamp = userComment.lastModified?.seconds
        ? new Date(Number(userComment.lastModified.seconds) * 1000).toISOString()
        : '';

      if (timestamp && timestamp >= startDate && timestamp <= endDate + 'T23:59:59Z') {
        const replyComment = review.comments?.[1]?.developerComment;

        reviews.push({
          reviewId: review.reviewId ?? '',
          text: userComment.text ?? '',
          rating: userComment.starRating ?? 0,
          author: review.authorName ?? 'Anonymous',
          date: timestamp,
          language: userComment.reviewerLanguage ?? '',
          replyText: replyComment?.text ?? undefined,
          replyDate: replyComment?.lastModified?.seconds
            ? new Date(Number(replyComment.lastModified.seconds) * 1000).toISOString()
            : undefined,
        });
      }
    }

    return {
      period,
      reviews,
      totalCount: reviews.length,
    };
  }

  async getStability(period: string): Promise<PlayStoreStability> {
    return cachedFetch<PlayStoreStability>(
      'playstore', 'stability', period,
      () => this.fetchStability(period),
    );
  }

  private async fetchStability(period: string): Promise<PlayStoreStability> {
    const bucketName = process.env.GOOGLE_PLAY_REPORTS_BUCKET;
    if (!bucketName) {
      throw new Error('GOOGLE_PLAY_REPORTS_BUCKET is not set — needed for stability data');
    }

    const storage = this.getStorage();
    const prefix = `stats/crashes/crashes_${this.packageName}_`;
    const res = await storage.objects.list({ bucket: bucketName, prefix });
    const objects = res.data.items ?? [];

    const [year, month] = period.split('-');
    const targetFile = objects.find(o => o.name?.includes(`${year}${month}`));

    if (!targetFile?.name) {
      throw new Error(`No crash report found for ${period}`);
    }

    const fileRes = await storage.objects.get({
      bucket: bucketName,
      object: targetFile.name,
      alt: 'media',
    });

    const csv = String(fileRes.data);
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',');

    const crashIdx = headers.indexOf('Daily Crashes');
    const anrIdx = headers.indexOf('Daily ANRs');

    let totalCrashes = 0;
    let totalAnrs = 0;
    let days = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      totalCrashes += parseInt(cols[crashIdx], 10) || 0;
      totalAnrs += parseInt(cols[anrIdx], 10) || 0;
      days++;
    }

    const crashRate = days > 0 ? totalCrashes / days : 0;
    const anrRate = days > 0 ? totalAnrs / days : 0;

    return {
      period,
      crashRate,
      anrRate,
      crashFreeRate: null,
      totalCrashes,
      totalAnrs,
    };
  }
}
