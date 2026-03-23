import { periodToDateRange } from '../formatters.js';
import { cachedFetch } from '../cache.js';
import type {
  MetaPageInsights,
  MetaInstagramInsights,
  MetaInstagramPost,
  MetaInstagramPosts,
  MetaVideoPost,
  MetaFacebookVideoPosts,
  MetaInstagramVideoPost,
  MetaInstagramVideoPosts,
  MetaAdSpend,
  MetaCampaignPerformance,
  MetaAdPerformance,
  MetaAdConversions,
  MetaAdCountryEntry,
  MetaAdPerformanceByCountry,
} from '../types.js';

const GRAPH_API_VERSION = 'v25.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface GraphApiError {
  error?: { message: string; type: string; code: number };
}

export class MetaClient {
  private accessToken: string;
  private pageId: string;
  private igAccountId: string;
  private adAccountId: string;
  private pageAccessToken: string | null = null;

  constructor() {
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) throw new Error('META_ACCESS_TOKEN is not set');
    this.accessToken = token;

    this.pageId = process.env.META_PAGE_ID ?? '';
    this.igAccountId = process.env.META_INSTAGRAM_ACCOUNT_ID ?? '';
    this.adAccountId = process.env.META_AD_ACCOUNT_ID ?? '';
  }

  // ============================================================
  // Private helpers
  // ============================================================

  /** Get Page Access Token (required for Page insights). Fetched lazily and cached. */
  private async getPageAccessToken(): Promise<string> {
    if (this.pageAccessToken) return this.pageAccessToken;

    const data = await this.graphRequest<{ access_token: string }>(
      `/${this.pageId}`,
      { fields: 'access_token' },
    );
    this.pageAccessToken = data.access_token;
    return this.pageAccessToken;
  }

  /** Make a Graph API request */
  private async graphRequest<T>(path: string, params: Record<string, string> = {}, token?: string): Promise<T> {
    const url = new URL(`${GRAPH_API_BASE}${path}`);
    url.searchParams.set('access_token', token ?? this.accessToken);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString());
    const data = await response.json() as T & GraphApiError;

    if (data.error) {
      throw new Error(`Meta Graph API error: ${data.error.message} (code: ${data.error.code})`);
    }

    return data;
  }

  /** Make a paginated Graph API request, following paging.next cursors */
  private async graphRequestPaginated<T>(path: string, params: Record<string, string> = {}, token?: string): Promise<T[]> {
    const items: T[] = [];
    let url: string | null = null;

    // Build initial URL
    const initial = new URL(`${GRAPH_API_BASE}${path}`);
    initial.searchParams.set('access_token', token ?? this.accessToken);
    for (const [key, value] of Object.entries(params)) {
      initial.searchParams.set(key, value);
    }
    url = initial.toString();

    while (url) {
      const response = await fetch(url);
      const data = await response.json() as GraphApiError & { data?: T[]; paging?: { next?: string } };

      if (data.error) {
        throw new Error(`Meta Graph API error: ${data.error.message} (code: ${data.error.code})`);
      }

      if (data.data) {
        items.push(...data.data);
      }

      url = data.paging?.next ?? null;
    }

    return items;
  }

  /** Convert YYYY-MM period to UNIX timestamps (start of first day, end of last day) */
  private periodToUnixRange(period: string, maxDays?: number): { since: number; until: number } {
    const { startDate, endDate } = periodToDateRange(period);
    const since = Math.floor(new Date(startDate + 'T00:00:00Z').getTime() / 1000);
    let until = Math.floor(new Date(endDate + 'T23:59:59Z').getTime() / 1000);
    if (maxDays) {
      const maxRange = maxDays * 86400 - 1;
      if (until - since > maxRange) {
        until = since + maxRange;
      }
    }
    return { since, until };
  }

  // ============================================================
  // Organic Social — Facebook Page
  // ============================================================

  async getPageInsights(period: string): Promise<MetaPageInsights> {
    if (!this.pageId) throw new Error('META_PAGE_ID is not set');

    return cachedFetch<MetaPageInsights>(
      'meta', 'page-insights', period,
      () => this.fetchPageInsights(period),
    );
  }

  private async fetchPageInsights(period: string): Promise<MetaPageInsights> {
    const { since, until } = this.periodToUnixRange(period);
    const pageToken = await this.getPageAccessToken();

    // Fetch page name
    const pageInfo = await this.graphRequest<{ id: string; name: string }>(
      `/${this.pageId}`,
      { fields: 'id,name' },
      pageToken,
    );

    // Fetch each metric individually to handle deprecated/unavailable ones gracefully
    const metricNames = [
      'page_impressions',
      'page_impressions_unique',
      'page_post_engagements',
      'page_fan_adds',
      'page_fan_removes',
      'page_fans',
      'page_video_views',
    ];

    const sums: Record<string, number> = {};
    let fansValues: Array<{ value: number; end_time: string }> = [];

    for (const metricName of metricNames) {
      try {
        const data = await this.graphRequestPaginated<{
          name: string;
          values: Array<{ value: number; end_time: string }>;
        }>(
          `/${this.pageId}/insights`,
          {
            metric: metricName,
            period: 'day',
            since: String(since),
            until: String(until),
          },
          pageToken,
        );

        if (metricName === 'page_fans') {
          fansValues = data[0]?.values ?? [];
        } else {
          for (const metric of data) {
            sums[metric.name] = (metric.values ?? []).reduce((sum, v) => sum + (v.value ?? 0), 0);
          }
        }
      } catch {
        // Skip unavailable metrics
      }
    }

    const pageFans = fansValues.length > 0 ? fansValues[fansValues.length - 1].value : 0;
    const pageFansStart = fansValues.length > 0 ? fansValues[0].value : pageFans;
    const pageFansGrowth = pageFans - pageFansStart;

    return {
      pageId: pageInfo.id,
      pageName: pageInfo.name,
      totalImpressions: sums['page_impressions'] ?? 0,
      totalReach: sums['page_impressions_unique'] ?? 0,
      engagedUsers: sums['page_post_engagements'] ?? 0,
      pageFans,
      pageFansGrowth,
      newLikes: sums['page_fan_adds'] ?? 0,
      unlikes: sums['page_fan_removes'] ?? 0,
      videoViews: sums['page_video_views'] ?? 0,
    };
  }

  // ============================================================
  // Organic Social — Instagram
  // ============================================================

  async getInstagramInsights(period: string): Promise<MetaInstagramInsights> {
    if (!this.igAccountId) throw new Error('META_INSTAGRAM_ACCOUNT_ID is not set');

    return cachedFetch<MetaInstagramInsights>(
      'meta', 'ig-insights', period,
      () => this.fetchInstagramInsights(period),
    );
  }

  private async fetchInstagramInsights(period: string): Promise<MetaInstagramInsights> {
    const { since, until } = this.periodToUnixRange(period, 30);

    // Fetch account info
    const accountInfo = await this.graphRequest<{ id: string; username: string; followers_count: number }>(
      `/${this.igAccountId}`,
      { fields: 'id,username,followers_count' },
    );

    // Fetch each metric individually to handle unavailable ones gracefully
    // views requires metric_type=total_value; follower_count only works for last 30 days
    const sums: Record<string, number> = {};
    let followerFirst: number | null = null;
    let followerLast: number | null = null;

    // views (requires metric_type=total_value)
    try {
      const viewsData = await this.graphRequestPaginated<{
        name: string;
        values: Array<{ value: number; end_time: string }>;
      }>(
        `/${this.igAccountId}/insights`,
        {
          metric: 'views',
          period: 'day',
          metric_type: 'total_value',
          since: String(since),
          until: String(until),
        },
      );
      for (const metric of viewsData) {
        sums[metric.name] = (metric.values ?? []).reduce((sum, v) => sum + (v.value ?? 0), 0);
      }
    } catch {
      // unavailable
    }

    // reach (standard day metric)
    try {
      const reachData = await this.graphRequestPaginated<{
        name: string;
        values: Array<{ value: number; end_time: string }>;
      }>(
        `/${this.igAccountId}/insights`,
        {
          metric: 'reach',
          period: 'day',
          since: String(since),
          until: String(until),
        },
      );
      for (const metric of reachData) {
        sums[metric.name] = (metric.values ?? []).reduce((sum, v) => sum + (v.value ?? 0), 0);
      }
    } catch {
      // unavailable
    }

    // follower_count (only last 30 days — gracefully skip for older periods)
    try {
      const followerData = await this.graphRequestPaginated<{
        name: string;
        values: Array<{ value: number; end_time: string }>;
      }>(
        `/${this.igAccountId}/insights`,
        {
          metric: 'follower_count',
          period: 'day',
          since: String(since),
          until: String(until),
        },
      );
      const values = followerData[0]?.values ?? [];
      if (values.length > 0) {
        followerFirst = values[0].value;
        followerLast = values[values.length - 1].value;
      }
    } catch {
      // follower_count unavailable for older periods
    }

    const followersGrowth = (followerFirst != null && followerLast != null)
      ? followerLast - followerFirst
      : 0;

    return {
      igUserId: accountInfo.id,
      username: accountInfo.username,
      followersCount: accountInfo.followers_count,
      followersGrowth,
      totalImpressions: sums['views'] ?? 0,
      totalReach: sums['reach'] ?? 0,
      profileViews: 0, // deprecated since v21
      websiteClicks: 0, // deprecated since v21
    };
  }

  async getInstagramPosts(period: string, limit = 20): Promise<MetaInstagramPosts> {
    if (!this.igAccountId) throw new Error('META_INSTAGRAM_ACCOUNT_ID is not set');

    return cachedFetch<MetaInstagramPosts>(
      'meta', `ig-posts-${limit}`, period,
      () => this.fetchInstagramPosts(period, limit),
    );
  }

  private async fetchInstagramPosts(period: string, limit: number): Promise<MetaInstagramPosts> {
    const { startDate, endDate } = periodToDateRange(period);
    const periodStart = new Date(startDate + 'T00:00:00Z').getTime();
    const periodEnd = new Date(endDate + 'T23:59:59Z').getTime();

    // Fetch media list
    const allMedia = await this.graphRequestPaginated<{
      id: string;
      caption?: string;
      media_type: string;
      permalink: string;
      timestamp: string;
      like_count: number;
      comments_count: number;
    }>(
      `/${this.igAccountId}/media`,
      {
        fields: 'id,caption,media_type,permalink,timestamp,like_count,comments_count',
        limit: '100',
      },
    );

    // Filter to period
    const periodMedia = allMedia.filter(m => {
      const ts = new Date(m.timestamp).getTime();
      return ts >= periodStart && ts <= periodEnd;
    });

    // Fetch per-post insights
    const posts: MetaInstagramPost[] = [];
    for (const media of periodMedia) {
      try {
        const insightsData = await this.graphRequestPaginated<{
          name: string;
          values: Array<{ value: number }>;
        }>(
          `/${media.id}/insights`,
          { metric: 'reach,views,saved,shares' },
        );

        const insightMap: Record<string, number> = {};
        for (const insight of insightsData) {
          insightMap[insight.name] = insight.values?.[0]?.value ?? 0;
        }

        const engagement = (media.like_count ?? 0) +
          (media.comments_count ?? 0) +
          (insightMap['saved'] ?? 0) +
          (insightMap['shares'] ?? 0);

        posts.push({
          id: media.id,
          caption: media.caption ?? '',
          mediaType: media.media_type,
          permalink: media.permalink,
          timestamp: media.timestamp,
          likeCount: media.like_count ?? 0,
          commentsCount: media.comments_count ?? 0,
          reach: insightMap['reach'] ?? 0,
          impressions: insightMap['views'] ?? 0,
          saved: insightMap['saved'] ?? 0,
          shares: insightMap['shares'] ?? 0,
          engagement,
        });
      } catch {
        // Skip posts where insights are unavailable (e.g. stories)
      }
    }

    // Sort by engagement descending
    posts.sort((a, b) => b.engagement - a.engagement);

    // Compute engagement rate
    const totalEngagement = posts.reduce((sum, p) => sum + p.engagement, 0);
    const totalReach = posts.reduce((sum, p) => sum + p.reach, 0);
    const engagementRate = totalReach > 0 ? totalEngagement / totalReach : 0;
    const averageEngagement = posts.length > 0 ? totalEngagement / posts.length : 0;

    // Sum views for video content only (VIDEO and REEL types)
    const totalVideoViews = posts
      .filter(p => p.mediaType === 'VIDEO' || p.mediaType === 'REEL')
      .reduce((sum, p) => sum + p.impressions, 0);

    return {
      posts: posts.slice(0, limit),
      totalCount: posts.length,
      averageEngagement: Math.round(averageEngagement * 100) / 100,
      engagementRate: Math.round(engagementRate * 10000) / 10000,
      totalVideoViews,
    };
  }

  // ============================================================
  // Video Posts — Facebook
  // ============================================================

  // No caching: video views are cumulative lifetime totals that keep growing over time
  async getFacebookVideoPosts(period: string): Promise<MetaFacebookVideoPosts> {
    if (!this.pageId) throw new Error('META_PAGE_ID is not set');
    return this.fetchFacebookVideoPosts(period);
  }

  private async fetchFacebookVideoPosts(period: string): Promise<MetaFacebookVideoPosts> {
    const { startDate, endDate } = periodToDateRange(period);
    const periodStart = new Date(startDate + 'T00:00:00Z').getTime();
    const periodEnd = new Date(endDate + 'T23:59:59Z').getTime();
    const pageToken = await this.getPageAccessToken();

    // Fetch published posts with attachments to identify videos
    const allPosts = await this.graphRequestPaginated<{
      id: string;
      message?: string;
      created_time: string;
      permalink_url: string;
      attachments?: { data: Array<{ media_type: string }> };
    }>(
      `/${this.pageId}/published_posts`,
      {
        fields: 'id,message,created_time,permalink_url,attachments{media_type}',
        limit: '100',
      },
      pageToken,
    );

    // Filter to period
    const periodPosts = allPosts.filter(p => {
      const ts = new Date(p.created_time).getTime();
      return ts >= periodStart && ts <= periodEnd;
    });

    // For each post, check if video and get views
    const videos: MetaVideoPost[] = [];
    for (const post of periodPosts) {
      const isVideo = post.attachments?.data?.[0]?.media_type === 'video';

      let views = 0;
      try {
        const insights = await this.graphRequestPaginated<{
          name: string;
          values: Array<{ value: number }>;
        }>(
          `/${post.id}/insights`,
          { metric: 'post_video_views' },
          pageToken,
        );
        views = insights[0]?.values?.[0]?.value ?? 0;
      } catch {
        // Not a video post or insights unavailable
      }

      if (isVideo || views > 0) {
        videos.push({
          id: post.id,
          date: post.created_time.split('T')[0],
          title: (post.message ?? '').split('\n')[0].substring(0, 120),
          views,
          link: post.permalink_url,
        });
      }
    }

    videos.sort((a, b) => b.date.localeCompare(a.date));
    const totalViews = videos.reduce((sum, v) => sum + v.views, 0);

    return { period, videos, totalViews };
  }

  // ============================================================
  // Video Posts — Instagram
  // ============================================================

  // No caching: video views are cumulative lifetime totals that keep growing over time
  async getInstagramVideoPosts(period: string): Promise<MetaInstagramVideoPosts> {
    if (!this.igAccountId) throw new Error('META_INSTAGRAM_ACCOUNT_ID is not set');
    return this.fetchInstagramVideoPosts(period);
  }

  private async fetchInstagramVideoPosts(period: string): Promise<MetaInstagramVideoPosts> {
    const { startDate, endDate } = periodToDateRange(period);
    const periodStart = new Date(startDate + 'T00:00:00Z').getTime();
    const periodEnd = new Date(endDate + 'T23:59:59Z').getTime();

    // Fetch media list
    const allMedia = await this.graphRequestPaginated<{
      id: string;
      caption?: string;
      media_type: string;
      permalink: string;
      timestamp: string;
      like_count: number;
      comments_count: number;
    }>(
      `/${this.igAccountId}/media`,
      {
        fields: 'id,caption,media_type,permalink,timestamp,like_count,comments_count',
        limit: '100',
      },
    );

    // Filter to period and VIDEO type only
    const videoMedia = allMedia.filter(m => {
      const ts = new Date(m.timestamp).getTime();
      return ts >= periodStart && ts <= periodEnd && m.media_type === 'VIDEO';
    });

    const videos: MetaInstagramVideoPost[] = [];
    for (const media of videoMedia) {
      let views = 0;
      try {
        const insights = await this.graphRequestPaginated<{
          name: string;
          values: Array<{ value: number }>;
        }>(
          `/${media.id}/insights`,
          { metric: 'views' },
        );
        views = insights[0]?.values?.[0]?.value ?? 0;
      } catch {
        // Insights unavailable
      }

      videos.push({
        id: media.id,
        date: media.timestamp.split('T')[0],
        title: (media.caption ?? '').split('\n')[0].substring(0, 120),
        views,
        link: media.permalink,
        likes: media.like_count ?? 0,
        comments: media.comments_count ?? 0,
      });
    }

    videos.sort((a, b) => b.date.localeCompare(a.date));
    const totalViews = videos.reduce((sum, v) => sum + v.views, 0);

    return { period, videos, totalViews };
  }

  // ============================================================
  // Paid Ads — Meta Marketing API
  // ============================================================

  async getAdSpend(period: string): Promise<MetaAdSpend> {
    if (!this.adAccountId) throw new Error('META_AD_ACCOUNT_ID is not set');

    return cachedFetch<MetaAdSpend>(
      'meta', 'ad-spend', period,
      () => this.fetchAdSpend(period),
    );
  }

  private async fetchAdSpend(period: string): Promise<MetaAdSpend> {
    const { startDate, endDate } = periodToDateRange(period);

    const data = await this.graphRequest<{
      data: Array<{
        spend: string;
        impressions: string;
        reach: string;
      }>;
    }>(
      `/act_${this.adAccountId}/insights`,
      {
        fields: 'spend,impressions,reach',
        time_range: JSON.stringify({ since: startDate, until: endDate }),
        level: 'account',
      },
    );

    const row = data.data?.[0];
    return {
      totalSpend: parseFloat(row?.spend ?? '0'),
      currency: 'USD',
      impressions: parseInt(row?.impressions ?? '0', 10),
      reach: parseInt(row?.reach ?? '0', 10),
    };
  }

  async getAdPerformance(period: string): Promise<MetaAdPerformance> {
    if (!this.adAccountId) throw new Error('META_AD_ACCOUNT_ID is not set');

    return cachedFetch<MetaAdPerformance>(
      'meta', 'ad-performance', period,
      () => this.fetchAdPerformance(period),
    );
  }

  private async fetchAdPerformance(period: string): Promise<MetaAdPerformance> {
    const { startDate, endDate } = periodToDateRange(period);

    const data = await this.graphRequest<{
      data: Array<{
        campaign_id: string;
        campaign_name: string;
        objective: string;
        spend: string;
        impressions: string;
        reach: string;
        clicks: string;
        ctr: string;
        cpc: string;
        cpm: string;
        frequency: string;
      }>;
    }>(
      `/act_${this.adAccountId}/insights`,
      {
        fields: 'campaign_id,campaign_name,objective,spend,impressions,reach,clicks,ctr,cpc,cpm,frequency',
        time_range: JSON.stringify({ since: startDate, until: endDate }),
        level: 'campaign',
        limit: '500',
      },
    );

    const campaigns: MetaCampaignPerformance[] = (data.data ?? []).map(row => ({
      campaignId: row.campaign_id,
      campaignName: row.campaign_name,
      objective: row.objective ?? '',
      spend: parseFloat(row.spend ?? '0'),
      impressions: parseInt(row.impressions ?? '0', 10),
      reach: parseInt(row.reach ?? '0', 10),
      clicks: parseInt(row.clicks ?? '0', 10),
      ctr: parseFloat(row.ctr ?? '0'),
      cpc: parseFloat(row.cpc ?? '0'),
      cpm: parseFloat(row.cpm ?? '0'),
      frequency: parseFloat(row.frequency ?? '0'),
    }));

    // Compute totals
    const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0);
    const totalImpressions = campaigns.reduce((sum, c) => sum + c.impressions, 0);
    const totalReach = campaigns.reduce((sum, c) => sum + c.reach, 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + c.clicks, 0);

    return {
      campaigns,
      totals: {
        spend: Math.round(totalSpend * 100) / 100,
        impressions: totalImpressions,
        reach: totalReach,
        clicks: totalClicks,
        ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
        cpc: totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 100) / 100 : 0,
        cpm: totalImpressions > 0 ? Math.round((totalSpend / totalImpressions * 1000) * 100) / 100 : 0,
      },
      currency: 'USD',
    };
  }

  async getAdConversions(period: string): Promise<MetaAdConversions> {
    if (!this.adAccountId) throw new Error('META_AD_ACCOUNT_ID is not set');

    return cachedFetch<MetaAdConversions>(
      'meta', 'ad-conversions', period,
      () => this.fetchAdConversions(period),
    );
  }

  private async fetchAdConversions(period: string): Promise<MetaAdConversions> {
    const { startDate, endDate } = periodToDateRange(period);

    const data = await this.graphRequest<{
      data: Array<{
        spend: string;
        actions?: Array<{ action_type: string; value: string }>;
        action_values?: Array<{ action_type: string; value: string }>;
      }>;
    }>(
      `/act_${this.adAccountId}/insights`,
      {
        fields: 'spend,actions,action_values',
        time_range: JSON.stringify({ since: startDate, until: endDate }),
        level: 'account',
      },
    );

    const row = data.data?.[0];
    const totalSpend = parseFloat(row?.spend ?? '0');

    // Parse actions into conversions
    const conversionsByType: Record<string, number> = {};
    let totalConversions = 0;

    for (const action of row?.actions ?? []) {
      // Count purchase, app_install, lead, complete_registration, etc.
      const conversionTypes = [
        'purchase', 'app_install', 'lead', 'complete_registration',
        'add_to_cart', 'initiate_checkout', 'subscribe', 'start_trial',
      ];
      if (conversionTypes.includes(action.action_type)) {
        const count = parseInt(action.value, 10);
        conversionsByType[action.action_type] = count;
        totalConversions += count;
      }
    }

    // Parse action_values for conversion value (primarily purchase value)
    let totalConversionValue = 0;
    for (const actionValue of row?.action_values ?? []) {
      if (actionValue.action_type === 'purchase' || actionValue.action_type === 'offsite_conversion.fb_pixel_purchase') {
        totalConversionValue += parseFloat(actionValue.value);
      }
    }

    const roas = totalSpend > 0 ? Math.round((totalConversionValue / totalSpend) * 100) / 100 : 0;
    const cpa = totalConversions > 0 ? Math.round((totalSpend / totalConversions) * 100) / 100 : 0;

    return {
      totalSpend,
      totalConversions,
      totalConversionValue: Math.round(totalConversionValue * 100) / 100,
      roas,
      cpa,
      conversionsByType,
      currency: 'USD',
    };
  }

  async getAdPerformanceByCountry(period: string): Promise<MetaAdPerformanceByCountry> {
    if (!this.adAccountId) throw new Error('META_AD_ACCOUNT_ID is not set');

    return cachedFetch<MetaAdPerformanceByCountry>(
      'meta', 'ad-by-country', period,
      () => this.fetchAdPerformanceByCountry(period),
    );
  }

  private async fetchAdPerformanceByCountry(period: string): Promise<MetaAdPerformanceByCountry> {
    const { startDate, endDate } = periodToDateRange(period);

    const data = await this.graphRequest<{
      data: Array<{
        country: string;
        spend: string;
        impressions: string;
        clicks: string;
        actions?: Array<{ action_type: string; value: string }>;
      }>;
    }>(
      `/act_${this.adAccountId}/insights`,
      {
        fields: 'country,spend,impressions,clicks,actions',
        time_range: JSON.stringify({ since: startDate, until: endDate }),
        level: 'account',
        breakdowns: 'country',
        limit: '500',
      },
    );

    let totalSpend = 0;
    const countries: MetaAdCountryEntry[] = (data.data ?? []).map(row => {
      const spend = parseFloat(row.spend ?? '0');
      totalSpend += spend;

      // Count conversions from actions
      let conversions = 0;
      for (const action of row.actions ?? []) {
        if (['purchase', 'app_install', 'lead', 'complete_registration'].includes(action.action_type)) {
          conversions += parseInt(action.value, 10);
        }
      }

      return {
        country: row.country,
        spend,
        impressions: parseInt(row.impressions ?? '0', 10),
        clicks: parseInt(row.clicks ?? '0', 10),
        conversions,
        cpa: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : 0,
      };
    });

    // Sort by spend descending
    countries.sort((a, b) => b.spend - a.spend);

    return {
      countries,
      totalSpend: Math.round(totalSpend * 100) / 100,
      currency: 'USD',
    };
  }
}
