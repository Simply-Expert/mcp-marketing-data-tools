import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';

function cachePath(platform: string, dataType: string, period: string): string {
  return path.join(DATA_DIR, 'cache', platform, dataType, `${period}.json`);
}

/**
 * Determine if a period is eligible for caching.
 * - Current month: never cache
 * - Previous month: only cache if today >= day 15 of current month
 * - Older months: always cacheable
 */
export function getCacheEligibility(period: string, now: Date = new Date()): 'cacheable' | 'no-cache' {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed
  const currentDay = now.getDate();

  const [periodYear, periodMonth] = period.split('-').map(Number);

  // Current month — never cache
  if (periodYear === currentYear && periodMonth === currentMonth) {
    return 'no-cache';
  }

  // Previous month — only cache if today >= day 15
  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = currentYear - 1;
  }

  if (periodYear === prevYear && periodMonth === prevMonth) {
    return currentDay >= 15 ? 'cacheable' : 'no-cache';
  }

  // Older months — always cacheable
  return 'cacheable';
}

export async function loadCache<T>(platform: string, dataType: string, period: string): Promise<T | null> {
  const filePath = cachePath(platform, dataType, period);
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function saveCache<T>(platform: string, dataType: string, period: string, data: T): Promise<void> {
  const filePath = cachePath(platform, dataType, period);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  // Atomic write: write to temp file then rename (rename is atomic on POSIX)
  const tmpPath = filePath + `.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmpPath, filePath);
}

export async function invalidateCache(platform: string, dataType: string, period: string): Promise<void> {
  const filePath = cachePath(platform, dataType, period);
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
}

/**
 * Convenience wrapper: check eligibility → load cache → if miss, call fetchFn → save if eligible → return.
 */
export async function cachedFetch<T>(
  platform: string,
  dataType: string,
  period: string,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const eligibility = getCacheEligibility(period);

  if (eligibility === 'cacheable') {
    const cached = await loadCache<T>(platform, dataType, period);
    if (cached !== null) return cached;
  }

  const data = await fetchFn();

  if (eligibility === 'cacheable') {
    await saveCache(platform, dataType, period, data);
  }

  return data;
}
