import { cachedFetch } from './cache.js';
import { periodToDateRange } from './formatters.js';

interface RatesSnapshot {
  date: string;
  rates: Record<string, number>; // uppercase keys, e.g. "SAR": 3.75
}

/**
 * Fetch USD-based exchange rates for the last day of a given period.
 * Uses fawazahmed0/currency-api (CDN-hosted, free, 340+ currencies).
 * Rates are "1 USD = X foreign".
 */
async function fetchRates(period: string): Promise<RatesSnapshot> {
  const { endDate } = periodToDateRange(period);

  const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${endDate}/v1/currencies/usd.json`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Exchange rate API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json() as { date: string; usd: Record<string, number> };

  // Normalize keys to uppercase to match Apple's currency codes
  const rates: Record<string, number> = {};
  for (const [key, value] of Object.entries(data.usd)) {
    rates[key.toUpperCase()] = value;
  }

  return { date: data.date, rates };
}

/**
 * Get USD exchange rates for a period (last day of month).
 * Results are cached to disk — same eligibility rules as all other data.
 */
export async function getRatesForPeriod(period: string): Promise<RatesSnapshot> {
  return cachedFetch<RatesSnapshot>(
    'currency', 'rates', period,
    () => fetchRates(period),
  );
}

/**
 * Convert an amount from a source currency to USD.
 */
export async function convertToUSD(amount: number, fromCurrency: string, period: string): Promise<number> {
  const normalized = fromCurrency.toUpperCase();
  if (normalized === 'USD') return amount;

  const snapshot = await getRatesForPeriod(period);
  const rate = snapshot.rates[normalized];

  if (!rate) {
    throw new Error(`No exchange rate found for ${fromCurrency} on ${snapshot.date}`);
  }

  // rates are "1 USD = X foreign", so foreign → USD = amount / rate
  return amount / rate;
}

/**
 * Batch-convert multiple currency amounts to USD.
 * Single rate fetch, then convert all items.
 */
export async function convertAllToUSD(
  items: Array<{ amount: number; currency: string }>,
  period: string,
): Promise<number> {
  if (items.length === 0) return 0;

  const snapshot = await getRatesForPeriod(period);
  let totalUSD = 0;

  for (const { amount, currency } of items) {
    const normalized = currency.toUpperCase();
    if (normalized === 'USD') {
      totalUSD += amount;
    } else {
      const rate = snapshot.rates[normalized];
      if (!rate) {
        throw new Error(`No exchange rate found for ${currency} on ${snapshot.date}`);
      }
      totalUSD += amount / rate;
    }
  }

  return totalUSD;
}
