import fs from 'node:fs';

import type { E2ERunInfo } from './e2e-contract';

function readRunInfo(): E2ERunInfo | null {
  const infoPath = process.env.RESOFEED_E2E_RUN_INFO;
  if (!infoPath || !fs.existsSync(infoPath)) return null;
  return JSON.parse(fs.readFileSync(infoPath, 'utf8')) as E2ERunInfo;
}

export default async function globalTeardown(): Promise<void> {
  const info = readRunInfo();
  if (!info) return;

  if (info.server.pid > 0) {
    try {
      process.kill(info.server.pid, 'SIGTERM');
    } catch {
      // Process already exited; artifacts remain useful.
    }
  }
  if (info.fixtureServer.pid > 0) {
    try {
      process.kill(info.fixtureServer.pid, 'SIGTERM');
    } catch {
      // Process already exited; artifacts remain useful.
    }
  }

  if (info.openRouterStub.pid > 0) {
    try {
      process.kill(info.openRouterStub.pid, 'SIGTERM');
    } catch {
      // Process already exited; artifacts remain useful.
    }
  }

  const cleanupNote = `${info.artifactRoot}/db-fixture-preservation.txt`;
  const preserve = process.env.RESOFEED_E2E_PRESERVE_DB === '1';
  if (!preserve && fs.existsSync(info.dbPath)) {
    fs.writeFileSync(cleanupNote, `cleaned up SQLite fixture: ${info.dbPath}\n`);
    fs.rmSync(info.dbPath, { force: true });
    return;
  }
  fs.writeFileSync(cleanupNote, `preserved SQLite fixture: ${info.dbPath}\n`);
}
