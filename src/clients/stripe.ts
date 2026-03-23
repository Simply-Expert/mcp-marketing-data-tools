import Stripe from 'stripe';
import { periodToDateRange } from '../formatters.js';
import { cachedFetch } from '../cache.js';
import { convertAllToUSD } from '../currency.js';
import type {
  StripeMRR,
  StripeSubscriptions,
  StripeChurn,
  StripeRevenue,
  StripeRevenueByPlan,
  StripeRevenuePlan,
  StripeRevenueByCountry,
  StripeRevenueCountryEntry,
  StripeRevenueByType,
  StripeDailyRevenue,
  StripeDailyRevenueEntry,
} from '../types.js';

export class StripeClient {
  private client: Stripe;
  private inFlightFetches = new Map<string, Promise<Stripe.Charge[]>>();

  constructor() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    this.client = new Stripe(key);
  }

  /** Convert YYYY-MM period to Unix timestamps */
  private periodToTimestamps(period: string): { start: number; end: number } {
    const { startDate, endDate } = periodToDateRange(period);
    return {
      start: Math.floor(new Date(startDate + 'T00:00:00Z').getTime() / 1000),
      end: Math.floor(new Date(endDate + 'T23:59:59Z').getTime() / 1000),
    };
  }

  /** Fetch all succeeded charges from the Stripe API with max expansions */
  private async fetchChargesFromAPI(period: string): Promise<Stripe.Charge[]> {
    const { start, end } = this.periodToTimestamps(period);
    const charges: Stripe.Charge[] = [];
    for await (const charge of this.client.charges.list({
      created: { gte: start, lte: end },
      limit: 100,
      expand: ['data.balance_transaction', 'data.invoice'],
    })) {
      if (charge.status === 'succeeded') {
        charges.push(charge);
      }
    }
    return charges;
  }

  /** Get all succeeded charges for a period, with caching and in-flight dedup */
  private async listSucceededCharges(period: string): Promise<Stripe.Charge[]> {
    // Deduplicate concurrent fetches for the same period
    const existing = this.inFlightFetches.get(period);
    if (existing) return existing;

    const promise = cachedFetch<Stripe.Charge[]>(
      'stripe', 'charges', period,
      () => this.fetchChargesFromAPI(period),
    ).finally(() => {
      this.inFlightFetches.delete(period);
    });

    this.inFlightFetches.set(period, promise);
    return promise;
  }

  /** Get settlement amount from a charge's expanded balance_transaction */
  private getSettlementAmount(charge: Stripe.Charge): { amount: number; fee: number; net: number } {
    const bt = charge.balance_transaction;
    if (bt && typeof bt === 'object') {
      return { amount: bt.amount, fee: bt.fee, net: bt.net };
    }
    return { amount: charge.amount, fee: 0, net: charge.amount };
  }

  /** Get all subscriptions using auto-pagination */
  private async listAllSubscriptions(params: Stripe.SubscriptionListParams): Promise<Stripe.Subscription[]> {
    const subs: Stripe.Subscription[] = [];
    for await (const sub of this.client.subscriptions.list(params)) {
      subs.push(sub);
    }
    return subs;
  }

  async getMRR(period: string): Promise<StripeMRR> {
    return cachedFetch<StripeMRR>(
      'stripe', 'mrr', period,
      () => this.fetchMRR(period),
    );
  }

  private async fetchMRR(period: string): Promise<StripeMRR> {
    const { end } = this.periodToTimestamps(period);

    // Get active subscriptions as of end of period
    const activeSubs = await this.listAllSubscriptions({
      status: 'active',
      created: { lte: end },
      limit: 100,
      expand: ['data.discount'],
    });

    // Also fetch canceled subs that were still active during the period
    // (canceled after the period ended — they were active at period end)
    const threeYearsAgo = end - 3 * 365 * 24 * 60 * 60;
    const canceledSubs = await this.listAllSubscriptions({
      status: 'canceled',
      created: { gte: threeYearsAgo, lte: end },
      limit: 100,
      expand: ['data.discount'],
    });
    const canceledButActiveInPeriod = canceledSubs.filter(
      (s) => s.canceled_at && s.canceled_at > end,
    );

    // Deduplicate by subscription ID (a sub can't appear in both lists,
    // but guard against pagination edge cases)
    const seen = new Set<string>();
    const allSubs: Stripe.Subscription[] = [];
    for (const sub of [...activeSubs, ...canceledButActiveInPeriod]) {
      if (!seen.has(sub.id)) {
        seen.add(sub.id);
        allSubs.push(sub);
      }
    }

    // Stripe zero-decimal currencies — unit_amount is already in major units
    const ZERO_DECIMAL = new Set([
      'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
      'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
    ]);

    // Collect { amount, currency } tuples for batch conversion to USD
    const mrrItems: Array<{ amount: number; currency: string }> = [];

    for (const sub of allSubs) {
      let monthlyMinor = 0; // in minor units (cents, halalas, etc.)

      // All items on a Stripe subscription share the same currency and interval
      const firstRecurring = sub.items.data.find((i) => i.price.recurring)?.price;
      const currency = (firstRecurring?.currency ?? sub.items.data[0]?.price.currency ?? 'usd').toUpperCase();
      const billingInterval = firstRecurring?.recurring?.interval;
      const billingIntervalCount = firstRecurring?.recurring?.interval_count ?? 1;

      for (const item of sub.items.data) {
        const price = item.price;
        const quantity = item.quantity ?? 1;
        const unitAmount = price.unit_amount ?? 0;

        if (price.recurring) {
          const intervalCount = price.recurring.interval_count ?? 1;
          switch (price.recurring.interval) {
            case 'month':
              monthlyMinor += Math.round((unitAmount * quantity) / intervalCount);
              break;
            case 'year':
              monthlyMinor += Math.round((unitAmount * quantity) / (12 * intervalCount));
              break;
            case 'week':
              monthlyMinor += Math.round((unitAmount * quantity * 52) / (12 * intervalCount));
              break;
            case 'day':
              monthlyMinor += Math.round((unitAmount * quantity * 365) / (12 * intervalCount));
              break;
          }
        }
      }

      // Apply discount if present
      if (sub.discount?.coupon) {
        const coupon = sub.discount.coupon;
        if (coupon.percent_off) {
          monthlyMinor = Math.round(monthlyMinor * (1 - coupon.percent_off / 100));
        } else if (coupon.amount_off && billingInterval) {
          // amount_off is per invoice — normalize to monthly
          let monthlyDiscount = 0;
          switch (billingInterval) {
            case 'month':
              monthlyDiscount = Math.round(coupon.amount_off / billingIntervalCount);
              break;
            case 'year':
              monthlyDiscount = Math.round(coupon.amount_off / (12 * billingIntervalCount));
              break;
            case 'week':
              monthlyDiscount = Math.round((coupon.amount_off * 52) / (12 * billingIntervalCount));
              break;
            case 'day':
              monthlyDiscount = Math.round((coupon.amount_off * 365) / (12 * billingIntervalCount));
              break;
          }
          monthlyMinor = Math.max(0, monthlyMinor - monthlyDiscount);
        }
      }

      if (monthlyMinor > 0) {
        // Convert minor units to major units; zero-decimal currencies skip /100
        const divisor = ZERO_DECIMAL.has(currency) ? 1 : 100;
        mrrItems.push({
          amount: monthlyMinor / divisor,
          currency,
        });
      }
    }

    // Batch-convert all amounts to USD
    const mrrUSD = await convertAllToUSD(mrrItems, period);

    return {
      period,
      mrr: Math.round(mrrUSD * 100) / 100,
      currency: 'USD',
      activeSubscriptions: allSubs.length,
    };
  }

  async getSubscriptions(period: string): Promise<StripeSubscriptions> {
    return cachedFetch<StripeSubscriptions>(
      'stripe', 'subscriptions', period,
      () => this.fetchSubscriptions(period),
    );
  }

  private async fetchSubscriptions(period: string): Promise<StripeSubscriptions> {
    const { start, end } = this.periodToTimestamps(period);

    // New subscriptions created in period
    const newSubs = await this.listAllSubscriptions({
      created: { gte: start, lte: end },
      limit: 100,
    });

    // Active at end of period
    const activeSubs = await this.listAllSubscriptions({
      status: 'active',
      created: { lte: end },
      limit: 100,
    });

    // Canceled in period — bound the query to avoid fetching entire history
    const canceledSubs = await this.listAllSubscriptions({
      status: 'canceled',
      created: { gte: start - 365 * 24 * 60 * 60, lte: end },
      limit: 100,
    });
    const canceledInPeriod = canceledSubs.filter(
      (s) => s.canceled_at && s.canceled_at >= start && s.canceled_at <= end
    );

    // Past due
    const pastDueSubs = await this.listAllSubscriptions({
      status: 'past_due',
      created: { lte: end },
      limit: 100,
    });

    return {
      period,
      new: newSubs.length,
      active: activeSubs.length,
      canceled: canceledInPeriod.length,
      pastDue: pastDueSubs.length,
    };
  }

  async getChurn(period: string): Promise<StripeChurn> {
    return cachedFetch<StripeChurn>(
      'stripe', 'churn', period,
      () => this.fetchChurn(period),
    );
  }

  private async fetchChurn(period: string): Promise<StripeChurn> {
    const { start, end } = this.periodToTimestamps(period);

    // Starting count: active at beginning of period
    const activeSubs = await this.listAllSubscriptions({
      status: 'active',
      created: { lt: start },
      limit: 100,
    });

    // Also include those created before period that are now canceled
    const canceledSubs = await this.listAllSubscriptions({
      status: 'canceled',
      created: { gte: start - 365 * 24 * 60 * 60, lt: start },
      limit: 100,
    });
    const canceledInPeriod = canceledSubs.filter(
      (s) => s.canceled_at && s.canceled_at >= start && s.canceled_at <= end
    );

    // Starting count includes currently active + those that canceled during period (they were active at start)
    const startingCount = activeSubs.length + canceledInPeriod.length;
    const churnRate = startingCount > 0 ? canceledInPeriod.length / startingCount : 0;

    return {
      period,
      churnRate,
      canceledCount: canceledInPeriod.length,
      startingCount,
    };
  }

  async getRevenue(period: string): Promise<StripeRevenue> {
    const charges = await this.listSucceededCharges(period);

    let totalCents = 0;
    let feeCents = 0;
    let netCents = 0;
    for (const charge of charges) {
      const { amount, fee, net } = this.getSettlementAmount(charge);
      totalCents += amount;
      feeCents += fee;
      netCents += net;
    }

    return {
      period,
      totalRevenue: totalCents / 100,
      totalFees: feeCents / 100,
      netRevenue: netCents / 100,
      chargeCount: charges.length,
      currency: 'USD',
    };
  }

  async getRevenueByPlan(period: string): Promise<StripeRevenueByPlan> {
    const charges = await this.listSucceededCharges(period);

    const planMap = new Map<string, { name: string; revenue: number; count: Set<string> }>();

    for (const charge of charges) {
      const { amount: settlementCents } = this.getSettlementAmount(charge);
      const invoice = charge.invoice && typeof charge.invoice === 'object' ? charge.invoice : null;

      if (invoice?.lines?.data?.length) {
        // Proportionally split settlement amount across line items
        const totalLineAmount = invoice.lines.data.reduce((sum, line) => sum + (line.amount ?? 0), 0);

        for (const line of invoice.lines.data) {
          const productId = typeof line.price?.product === 'string'
            ? line.price.product
            : line.price?.product?.toString() ?? 'unknown';
          const planName = line.description ?? line.price?.id ?? 'unknown';
          const proportion = totalLineAmount > 0
            ? (line.amount ?? 0) / totalLineAmount
            : 1 / invoice.lines.data.length;
          const lineSettlement = Math.round(settlementCents * proportion);

          if (!planMap.has(productId)) {
            planMap.set(productId, { name: planName, revenue: 0, count: new Set() });
          }
          const entry = planMap.get(productId)!;
          entry.revenue += lineSettlement;
          if (invoice.subscription) {
            const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id;
            entry.count.add(subId);
          }
        }
      } else {
        // No invoice or no line items — attribute to one-time charges
        if (!planMap.has('other')) {
          planMap.set('other', { name: 'One-time charges', revenue: 0, count: new Set() });
        }
        planMap.get('other')!.revenue += settlementCents;
      }
    }

    const plans: StripeRevenuePlan[] = [];
    let totalRevenue = 0;

    for (const [productId, data] of planMap) {
      const revenue = data.revenue / 100;
      plans.push({
        planId: productId,
        planName: data.name,
        revenue,
        subscriptionCount: data.count.size,
        currency: 'USD',
      });
      totalRevenue += revenue;
    }

    return {
      period,
      plans,
      totalRevenue,
      currency: 'USD',
    };
  }

  async getRevenueByCountry(period: string): Promise<StripeRevenueByCountry> {
    const charges = await this.listSucceededCharges(period);

    const countryMap = new Map<string, { revenue: number; count: number }>();

    for (const charge of charges) {
      const { amount: settlementCents } = this.getSettlementAmount(charge);
      const country = charge.billing_details?.address?.country ?? 'Unknown';

      const entry = countryMap.get(country);
      if (entry) {
        entry.revenue += settlementCents;
        entry.count++;
      } else {
        countryMap.set(country, { revenue: settlementCents, count: 1 });
      }
    }

    const countries: StripeRevenueCountryEntry[] = [];
    let totalRevenue = 0;

    for (const [country, data] of countryMap) {
      const revenue = data.revenue / 100;
      countries.push({ country, revenue, chargeCount: data.count });
      totalRevenue += revenue;
    }

    // Sort by revenue descending
    countries.sort((a, b) => b.revenue - a.revenue);

    return {
      period,
      countries,
      totalRevenue,
      currency: 'USD',
    };
  }

  async getRevenueByType(period: string): Promise<StripeRevenueByType> {
    const charges = await this.listSucceededCharges(period);

    let newCents = 0;
    let renewalCents = 0;
    let otherCents = 0;
    let newCount = 0;
    let renewalCount = 0;
    let otherCount = 0;

    for (const charge of charges) {
      const { amount: settlementCents } = this.getSettlementAmount(charge);
      const invoice = charge.invoice && typeof charge.invoice === 'object' ? charge.invoice : null;
      const reason = invoice?.billing_reason;

      if (reason === 'subscription_create') {
        newCents += settlementCents;
        newCount++;
      } else if (reason === 'subscription_cycle') {
        renewalCents += settlementCents;
        renewalCount++;
      } else {
        otherCents += settlementCents;
        otherCount++;
      }
    }

    return {
      period,
      newRevenue: newCents / 100,
      renewalRevenue: renewalCents / 100,
      otherRevenue: otherCents / 100,
      newCharges: newCount,
      renewalCharges: renewalCount,
      otherCharges: otherCount,
      totalRevenue: (newCents + renewalCents + otherCents) / 100,
      currency: 'USD',
    };
  }

  async getDailyRevenue(startDate: string, endDate: string): Promise<StripeDailyRevenue> {
    const start = Math.floor(new Date(startDate + 'T00:00:00Z').getTime() / 1000);
    const end = Math.floor(new Date(endDate + 'T23:59:59Z').getTime() / 1000);

    const charges: Stripe.Charge[] = [];
    for await (const charge of this.client.charges.list({
      created: { gte: start, lte: end },
      limit: 100,
      expand: ['data.balance_transaction', 'data.invoice'],
    })) {
      if (charge.status === 'succeeded') {
        charges.push(charge);
      }
    }

    // Group charges by day
    const dayMap = new Map<string, { revenue: number; fees: number; net: number; count: number; newSubs: number; renewals: number }>();

    for (const charge of charges) {
      const date = new Date(charge.created * 1000).toISOString().slice(0, 10);
      const { amount, fee, net } = this.getSettlementAmount(charge);
      const invoice = charge.invoice && typeof charge.invoice === 'object' ? charge.invoice : null;
      const reason = invoice?.billing_reason;

      if (!dayMap.has(date)) {
        dayMap.set(date, { revenue: 0, fees: 0, net: 0, count: 0, newSubs: 0, renewals: 0 });
      }
      const entry = dayMap.get(date)!;
      entry.revenue += amount;
      entry.fees += fee;
      entry.net += net;
      entry.count++;
      if (reason === 'subscription_create') entry.newSubs++;
      else if (reason === 'subscription_cycle') entry.renewals++;
    }

    // Fill in missing days with zeros
    const days: StripeDailyRevenueEntry[] = [];
    const cursor = new Date(startDate + 'T00:00:00Z');
    const endDt = new Date(endDate + 'T00:00:00Z');
    while (cursor <= endDt) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const data = dayMap.get(dateStr);
      days.push({
        date: dateStr,
        revenue: data ? data.revenue / 100 : 0,
        fees: data ? data.fees / 100 : 0,
        netRevenue: data ? data.net / 100 : 0,
        chargeCount: data?.count ?? 0,
        newSubscriptions: data?.newSubs ?? 0,
        renewals: data?.renewals ?? 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const totals = days.reduce(
      (acc, d) => ({
        revenue: acc.revenue + d.revenue,
        fees: acc.fees + d.fees,
        netRevenue: acc.netRevenue + d.netRevenue,
        chargeCount: acc.chargeCount + d.chargeCount,
        newSubscriptions: acc.newSubscriptions + d.newSubscriptions,
        renewals: acc.renewals + d.renewals,
      }),
      { revenue: 0, fees: 0, netRevenue: 0, chargeCount: 0, newSubscriptions: 0, renewals: 0 },
    );

    return {
      startDate,
      endDate,
      days,
      totals: {
        revenue: Math.round(totals.revenue * 100) / 100,
        fees: Math.round(totals.fees * 100) / 100,
        netRevenue: Math.round(totals.netRevenue * 100) / 100,
        chargeCount: totals.chargeCount,
        newSubscriptions: totals.newSubscriptions,
        renewals: totals.renewals,
      },
      currency: 'USD',
    };
  }
}
