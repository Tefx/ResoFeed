import fs from 'node:fs';
import path from 'node:path';
import type { TestInfo } from 'playwright/test';

export interface TestDatabase {
  readonly directory: string;
  readonly path: string;
}

export function createTestDatabase(testInfo: TestInfo): TestDatabase {
  const directory = testInfo.outputPath('runtime');
  fs.mkdirSync(directory, { recursive: true });
  return { directory, path: path.join(directory, 'resofeed.sqlite3') };
}

export function removeTestDatabase(database: TestDatabase): void {
  for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${database.path}${suffix}`, { force: true });
}

export function databaseResidue(database: TestDatabase): readonly string[] {
  return ['', '-shm', '-wal']
    .map((suffix) => `${database.path}${suffix}`)
    .filter((candidate) => fs.existsSync(candidate));
}
