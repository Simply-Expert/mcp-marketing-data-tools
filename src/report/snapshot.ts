import fs from 'fs/promises';
import path from 'path';
import type { MonthlySnapshot } from '../types.js';

const DATA_DIR = process.env.DATA_DIR || './data';

function snapshotPath(period: string): string {
  return path.join(DATA_DIR, 'snapshots', `${period}.json`);
}

export async function saveSnapshot(snapshot: MonthlySnapshot): Promise<string> {
  const filePath = snapshotPath(snapshot.period);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
  return filePath;
}

export async function loadSnapshot(period: string): Promise<MonthlySnapshot | null> {
  const filePath = snapshotPath(period);
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as MonthlySnapshot;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function listSnapshots(): Promise<string[]> {
  const dir = path.join(DATA_DIR, 'snapshots');
  try {
    const files = await fs.readdir(dir);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
      .sort();
  } catch {
    return [];
  }
}
