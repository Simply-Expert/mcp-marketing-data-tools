import type { GoalHealthCheck, GoalHealthEntry } from '../types.js';
import { loadSnapshot, listSnapshots } from '../report/snapshot.js';
import { loadGoals, getGoalTargets } from './loader.js';
import { compareGoals } from './comparator.js';

export async function healthCheck(months = 3): Promise<GoalHealthCheck> {
  const goals = await loadGoals();
  const targets = getGoalTargets(goals);
  const availableSnapshots = await listSnapshots();

  // Use the most recent N snapshots
  const periodsToCheck = availableSnapshots.slice(-months);

  // Track hits per goal key
  const hitMap = new Map<string, { hits: number; total: number }>();

  for (const target of targets) {
    hitMap.set(target.key, { hits: 0, total: 0 });
  }

  for (const period of periodsToCheck) {
    const snapshot = await loadSnapshot(period);
    if (!snapshot) continue;

    const result = compareGoals(period, snapshot, goals);

    for (const comparison of result.comparisons) {
      const entry = hitMap.get(comparison.key);
      if (!entry) continue;

      if (comparison.status !== 'no_data') {
        entry.total++;
        if (comparison.status === 'hit') {
          entry.hits++;
        }
      }
    }
  }

  const entries: GoalHealthEntry[] = targets.map(target => {
    const entry = hitMap.get(target.key)!;
    const hitRate = entry.total > 0 ? entry.hits / entry.total : 0;

    let recommendation: string;
    if (entry.total === 0) {
      recommendation = 'No data available — ensure this metric is being tracked';
    } else if (hitRate >= 0.8) {
      recommendation = 'Consistently hitting — consider raising the target';
    } else if (hitRate >= 0.5) {
      recommendation = 'On track — keep current goal';
    } else {
      recommendation = 'Goal may be too aggressive — consider lowering the target';
    }

    return {
      key: target.key,
      label: target.label,
      hitCount: entry.hits,
      totalMonths: entry.total,
      hitRate: Math.round(hitRate * 100) / 100,
      recommendation,
    };
  });

  return { months, entries };
}
