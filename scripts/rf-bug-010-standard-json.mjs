#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function collect(report) {
  const identities = [];
  const outcomes = [];
  function visitSuite(suite, titles = []) {
    const nextTitles = suite.title ? [...titles, suite.title] : titles;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const identity = `${path.basename(spec.file ?? suite.file ?? 'unknown.spec.ts')} › ${[...nextTitles, spec.title, ...(test.title ? [test.title] : [])].filter(Boolean).join(' › ')}`;
        identities.push(identity);
        for (const result of test.results ?? []) outcomes.push({ identity, status: result.status, attempt: result.retry ?? 0 });
      }
    }
    for (const child of suite.suites ?? []) visitSuite(child, nextTitles);
  }
  for (const suite of report.suites ?? []) visitSuite(suite);
  return { identities: [...new Set(identities)].sort(), outcomes };
}

function lanePrefix(value) {
  if (!/^RF-BUG-010_(?:OLD|REPLACEMENT)$/u.test(value ?? '')) {
    throw new Error('lane prefix must be RF-BUG-010_OLD or RF-BUG-010_REPLACEMENT');
  }
  return value;
}

function filesFor(identities) {
  return [...new Set(identities.map((identity) => identity.split(' › ', 1)[0]))].sort();
}

function printDiscovery(prefix, discovered) {
  const files = filesFor(discovered.identities);
  console.log(`${prefix}_COUNT=${discovered.identities.length}`);
  console.log(`${prefix}_FILE_COUNT=${files.length}`);
  console.log(`${prefix}_FILES=${files.join(',')}`);
  console.log(`${prefix}_IDENTITIES=${JSON.stringify(discovered.identities)}`);
}

const [command, firstFile, secondValue, ...rest] = process.argv.slice(2);
if (command === 'discover') {
  const prefix = lanePrefix(secondValue);
  if (!firstFile || rest.length === 0) {
    throw new Error('usage: rf-bug-010-standard-json.mjs discover <list.json> RF-BUG-010_OLD|RF-BUG-010_REPLACEMENT <expected files...>');
  }
  const discovered = collect(JSON.parse(fs.readFileSync(firstFile, 'utf8')));
  if (discovered.identities.length === 0) throw new Error(`${prefix} collection was empty`);
  if (discovered.outcomes.length !== 0) throw new Error(`${prefix} discovery unexpectedly executed tests`);
  const expectedFiles = [...new Set(rest.map((file) => path.basename(file)))].sort();
  if (JSON.stringify(filesFor(discovered.identities)) !== JSON.stringify(expectedFiles)) {
    throw new Error(`${prefix} native file discovery differs from the expected lane`);
  }
  printDiscovery(prefix, discovered);
  process.exit(0);
}

if (command === 'compare') {
  const prefix = lanePrefix(rest[0]);
  if (!firstFile || !secondValue) {
    throw new Error('usage: rf-bug-010-standard-json.mjs compare <list.json> <run.json> RF-BUG-010_OLD|RF-BUG-010_REPLACEMENT');
  }
  const listed = collect(JSON.parse(fs.readFileSync(firstFile, 'utf8')));
  const executed = collect(JSON.parse(fs.readFileSync(secondValue, 'utf8')));
  if (listed.identities.length === 0) throw new Error(`${prefix} collection was empty`);
  if (JSON.stringify(listed.identities) !== JSON.stringify(executed.identities)) throw new Error(`${prefix} collection/execution identities differ`);
  if (executed.outcomes.length !== executed.identities.length) throw new Error(`${prefix} each identity must execute exactly once`);
  if (executed.outcomes.some((entry) => entry.status !== 'passed' || entry.attempt !== 0)) throw new Error(`${prefix} execution outcome was not a first-attempt pass`);
  printDiscovery(prefix, executed);
  process.exit(0);
}

throw new Error('usage: rf-bug-010-standard-json.mjs discover|compare ...');
