/**
 * Markdown formatting helpers for report output
 */

/** Format a number with commas: 1234567 → "1,234,567" */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/** Format currency: 12345.67 → "$12,345.67" */
export function formatCurrency(n: number, currency = 'USD'): string {
  return n.toLocaleString('en-US', { style: 'currency', currency });
}

/** Format percentage: 0.0534 → "5.34%" */
export function formatPercent(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

/** Status indicator based on percent difference from goal */
export function goalStatus(actual: number, target: number): string {
  const diff = (actual - target) / target;
  if (diff >= 0) return '🟢';
  if (diff >= -0.1) return '🟡';
  return '🔴';
}

/** Format a change with sign and percent */
export function formatChange(current: number, previous: number): string {
  if (previous === 0) return 'N/A';
  const change = current - previous;
  const pct = (change / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

/** Build a markdown table from headers and rows */
export function markdownTable(headers: string[], rows: string[][]): string {
  const headerRow = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const dataRows = rows.map(row => `| ${row.join(' | ')} |`).join('\n');
  return `${headerRow}\n${separator}\n${dataRows}`;
}

/** Get date range for a YYYY-MM period */
export function periodToDateRange(period: string): { startDate: string; endDate: string } {
  const [year, month] = period.split('-').map(Number);
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  // Last day of month
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

/** Get the previous month period: "2026-02" → "2026-01" */
export function previousPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}
