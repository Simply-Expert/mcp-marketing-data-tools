import { google } from 'googleapis';
import { periodToDateRange } from '../formatters.js';
import { cachedFetch } from '../cache.js';
import type {
  SearchConsoleOverview,
  SearchConsoleTopQueries,
  SearchConsoleTopPages,
  SearchConsoleByCountry,
  SearchConsoleByDevice,
  SearchConsoleRow,
  SearchConsoleQueryPagePairs,
  SearchConsoleDailyTrend,
  SearchConsoleBrandedSplit,
  SearchConsoleBySearchType,
} from '../types.js';

export class SearchConsoleClient {
  private siteUrl: string;
  private authClient: InstanceType<typeof google.auth.GoogleAuth>;

  constructor() {
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    const siteUrl = process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL;

    if (!keyPath) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH is not set');
    if (!siteUrl) throw new Error('GOOGLE_SEARCH_CONSOLE_SITE_URL is not set');

    this.siteUrl = siteUrl;

    this.authClient = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });
  }

  private getSearchConsole() {
    return google.searchconsole({
      version: 'v1',
      auth: this.authClient as any,
    });
  }

  private async fetchAnalytics(
    period: string,
    dimensions: string[],
    rowLimit = 0,
    extras: { type?: string; dimensionFilterGroups?: any[] } = {},
  ): Promise<SearchConsoleRow[]> {
    const { startDate, endDate } = periodToDateRange(period);
    const sc = this.getSearchConsole();

    const body: any = {
      startDate,
      endDate,
      dimensions,
    };
    if (rowLimit > 0) {
      body.rowLimit = rowLimit;
    }
    if (extras.type) {
      body.type = extras.type;
    }
    if (extras.dimensionFilterGroups) {
      body.dimensionFilterGroups = extras.dimensionFilterGroups;
    }

    const res = await sc.searchanalytics.query({
      siteUrl: this.siteUrl,
      requestBody: body,
    });

    const rows = res.data.rows ?? [];
    return rows.map((row) => ({
      keys: row.keys ?? [],
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    }));
  }

  async getOverview(period: string): Promise<SearchConsoleOverview> {
    return cachedFetch<SearchConsoleOverview>(
      'searchconsole', 'overview', period,
      () => this.fetchOverview(period),
    );
  }

  private async fetchOverview(period: string): Promise<SearchConsoleOverview> {
    // Query with no dimensions to get totals
    const rows = await this.fetchAnalytics(period, []);
    const row = rows[0];

    return {
      period,
      totalClicks: row?.clicks ?? 0,
      totalImpressions: row?.impressions ?? 0,
      averageCtr: row?.ctr ?? 0,
      averagePosition: row?.position ?? 0,
    };
  }

  async getTopQueries(period: string, limit = 20): Promise<SearchConsoleTopQueries> {
    const full = await cachedFetch<SearchConsoleTopQueries>(
      'searchconsole', 'topQueries', period,
      () => this.fetchTopQueries(period),
    );

    if (limit >= full.queries.length) return full;
    return {
      ...full,
      queries: full.queries.slice(0, limit),
    };
  }

  private async fetchTopQueries(period: string): Promise<SearchConsoleTopQueries> {
    const rows = await this.fetchAnalytics(period, ['query'], 50);

    return {
      period,
      queries: rows.map((row) => ({
        query: row.keys[0] ?? '',
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      })),
    };
  }

  async getTopPages(period: string, limit = 20): Promise<SearchConsoleTopPages> {
    const full = await cachedFetch<SearchConsoleTopPages>(
      'searchconsole', 'topPages', period,
      () => this.fetchTopPages(period),
    );

    if (limit >= full.pages.length) return full;
    return {
      ...full,
      pages: full.pages.slice(0, limit),
    };
  }

  private async fetchTopPages(period: string): Promise<SearchConsoleTopPages> {
    const rows = await this.fetchAnalytics(period, ['page'], 50);

    return {
      period,
      pages: rows.map((row) => ({
        page: row.keys[0] ?? '',
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      })),
    };
  }

  async getPerformanceByCountry(period: string): Promise<SearchConsoleByCountry> {
    return cachedFetch<SearchConsoleByCountry>(
      'searchconsole', 'byCountry', period,
      () => this.fetchPerformanceByCountry(period),
    );
  }

  private async fetchPerformanceByCountry(period: string): Promise<SearchConsoleByCountry> {
    const rows = await this.fetchAnalytics(period, ['country'], 50);

    return {
      period,
      countries: rows.map((row) => ({
        country: row.keys[0] ?? '',
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      })),
    };
  }

  async getPerformanceByDevice(period: string): Promise<SearchConsoleByDevice> {
    return cachedFetch<SearchConsoleByDevice>(
      'searchconsole', 'byDevice', period,
      () => this.fetchPerformanceByDevice(period),
    );
  }

  private async fetchPerformanceByDevice(period: string): Promise<SearchConsoleByDevice> {
    const rows = await this.fetchAnalytics(period, ['device']);

    return {
      period,
      devices: rows.map((row) => ({
        device: row.keys[0] ?? '',
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      })),
    };
  }

  async getQueryPagePairs(period: string, limit = 50): Promise<SearchConsoleQueryPagePairs> {
    const full = await cachedFetch<SearchConsoleQueryPagePairs>(
      'searchconsole', 'queryPagePairs', period,
      () => this.fetchQueryPagePairs(period),
    );

    if (limit >= full.pairs.length) return full;
    return { ...full, pairs: full.pairs.slice(0, limit) };
  }

  private async fetchQueryPagePairs(period: string): Promise<SearchConsoleQueryPagePairs> {
    const rows = await this.fetchAnalytics(period, ['query', 'page'], 200);

    return {
      period,
      pairs: rows.map((row) => ({
        query: row.keys[0] ?? '',
        page: row.keys[1] ?? '',
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      })),
    };
  }

  async getDailyTrend(period: string): Promise<SearchConsoleDailyTrend> {
    return cachedFetch<SearchConsoleDailyTrend>(
      'searchconsole', 'dailyTrend', period,
      () => this.fetchDailyTrend(period),
    );
  }

  private async fetchDailyTrend(period: string): Promise<SearchConsoleDailyTrend> {
    const rows = await this.fetchAnalytics(period, ['date']);

    return {
      period,
      days: rows.map((row) => ({
        date: row.keys[0] ?? '',
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      })),
    };
  }

  async getBrandedSplit(
    period: string,
    brandTerms: string[] = ['noory'],
  ): Promise<SearchConsoleBrandedSplit> {
    const cacheKey = `brandedSplit:${brandTerms.map((t) => t.toLowerCase()).sort().join('|')}`;
    return cachedFetch<SearchConsoleBrandedSplit>(
      'searchconsole', cacheKey, period,
      () => this.fetchBrandedSplit(period, brandTerms),
    );
  }

  private async fetchBrandedSplit(
    period: string,
    brandTerms: string[],
  ): Promise<SearchConsoleBrandedSplit> {
    const regex = brandTerms
      .map((t) => t.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');

    const [brandedRows, nonBrandedRows] = await Promise.all([
      this.fetchAnalytics(period, [], 0, {
        dimensionFilterGroups: [{
          groupType: 'and',
          filters: [{ dimension: 'query', operator: 'includingRegex', expression: regex }],
        }],
      }),
      this.fetchAnalytics(period, [], 0, {
        dimensionFilterGroups: [{
          groupType: 'and',
          filters: [{ dimension: 'query', operator: 'excludingRegex', expression: regex }],
        }],
      }),
    ]);

    const b = brandedRows[0];
    const nb = nonBrandedRows[0];

    return {
      period,
      brandTerms,
      branded: {
        clicks: b?.clicks ?? 0,
        impressions: b?.impressions ?? 0,
        ctr: b?.ctr ?? 0,
        position: b?.position ?? 0,
      },
      nonBranded: {
        clicks: nb?.clicks ?? 0,
        impressions: nb?.impressions ?? 0,
        ctr: nb?.ctr ?? 0,
        position: nb?.position ?? 0,
      },
    };
  }

  async getBySearchType(period: string): Promise<SearchConsoleBySearchType> {
    return cachedFetch<SearchConsoleBySearchType>(
      'searchconsole', 'bySearchType', period,
      () => this.fetchBySearchType(period),
    );
  }

  private async fetchBySearchType(period: string): Promise<SearchConsoleBySearchType> {
    const types = ['web', 'image', 'video', 'news'];
    const results = await Promise.all(
      types.map(async (t) => {
        const rows = await this.fetchAnalytics(period, [], 0, { type: t });
        const row = rows[0];
        return {
          searchType: t,
          clicks: row?.clicks ?? 0,
          impressions: row?.impressions ?? 0,
          ctr: row?.ctr ?? 0,
          position: row?.position ?? 0,
        };
      }),
    );

    return { period, searchTypes: results };
  }
}
