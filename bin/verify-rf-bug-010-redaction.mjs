#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = path.join(repoRoot, '.test-artifacts', 'playwright');
const proofRoot = path.join(artifactRoot, 'rf-bug-010-artifact-proof');
const resultsPath = path.join(proofRoot, 'results', 'results.json');
const htmlPath = path.join(proofRoot, 'html-report', 'index.html');
const runInfoPath = path.join(artifactRoot, 'run-info.json');
const expectedTitle = '[RF-BUG-010] intentional failure retains complete artifacts';

function invariant(condition, message) {
  if (!condition) throw new Error(`RF-BUG-010 artifact verification failed: ${message}`);
}

function collectSpecs(suites, output = []) {
  for (const suite of suites ?? []) {
    output.push(...(suite.specs ?? []));
    collectSpecs(suite.suites, output);
  }
  return output;
}

function attachmentText(attachment) {
  if (typeof attachment.path === 'string') {
    invariant(fs.existsSync(attachment.path), `attachment ${attachment.name} is missing at ${attachment.path}`);
    return fs.readFileSync(attachment.path);
  }
  invariant(typeof attachment.body === 'string', `attachment ${attachment.name} lacks a standard path or inline body`);
  return Buffer.from(attachment.body, 'base64');
}

function assertRedacted(label, body) {
  const text = body.toString('utf8');
  const forbidden = [
    { pattern: /rfeed_[A-Za-z0-9_]{32,}/gu, name: 'raw owner token' },
    { pattern: /resofeed_e2e_non_secret_openrouter_key/gu, name: 'raw OpenRouter sentinel' },
    { pattern: /authorization\s*[:=]\s*bearer\s+(?!<redacted>)[^\s"',}]+/giu, name: 'authorization value' },
    { pattern: /cookie\s*[:=]\s*(?!<redacted>)[^\n]+/giu, name: 'cookie value' },
    { pattern: /OPENROUTER_KEY\s*=\s*(?!<redacted>)[^\s]+/gu, name: 'OpenRouter environment value' }
  ];
  for (const candidate of forbidden) {
    invariant(!candidate.pattern.test(text), `${label} contains ${candidate.name}`);
    candidate.pattern.lastIndex = 0;
  }
}

invariant(fs.existsSync(resultsPath), `standard JSON report missing: ${resultsPath}`);
invariant(fs.existsSync(htmlPath), `standard HTML report missing: ${htmlPath}`);

const reportBody = fs.readFileSync(resultsPath);
const report = JSON.parse(reportBody.toString('utf8'));
const specs = collectSpecs(report.suites);
invariant(specs.length === 1, `expected one collected spec, found ${specs.length}`);
invariant(specs[0].title === expectedTitle, `unexpected collected title: ${specs[0].title ?? '<missing>'}`);

const tests = specs.flatMap((spec) => spec.tests ?? []);
const results = tests.flatMap((entry) => entry.results ?? []);
invariant(tests.length === 1, `expected one test identity, found ${tests.length}`);
invariant(tests[0].expectedStatus === 'passed', `intentional failure expectedStatus must remain passed, got ${tests[0].expectedStatus}`);
invariant(results.length === 1, `expected one result with retries disabled, found ${results.length}`);
invariant(results[0].retry === 0, `unexpected retry index ${results[0].retry}`);
invariant(results[0].status === 'failed', `intentional assertion must be the sole failed result, got ${results[0].status}`);

const resultText = JSON.stringify(results[0]);
const lifecycleOutput = (results[0].stdout ?? []).map((entry) => typeof entry === 'string' ? entry : entry.text ?? '').join('');
const setupAt = lifecycleOutput.indexOf('RF-BUG-010_SETUP=ready');
const assertionAt = lifecycleOutput.indexOf('RF-BUG-010_ASSERTION_REACHED=ready');
const teardownAt = lifecycleOutput.indexOf('RF-BUG-010_TEARDOWN=clean');
invariant(setupAt >= 0 && assertionAt > setupAt && teardownAt > assertionAt, 'lifecycle order must be SETUP < ASSERTION_REACHED < TEARDOWN');
invariant(resultText.includes('RF-BUG-010_INTENTIONAL_ASSERTION'), 'failure fingerprint is not the intentional assertion');
invariant(!/webServer failed|authentication failed|No tests found/iu.test(resultText), 'startup, authentication, or collection failure contaminated the proof');

const attachments = new Map((results[0].attachments ?? []).map((attachment) => [attachment.name, attachment]));
for (const name of [
  'trace',
  'screenshot',
  'video',
  'server.stdout.log',
  'server.stderr.log',
  'sanitized-environment.md',
  'browser-console.json',
  'network-summary.json',
  'runtime-identity.json',
  'runtime-cleanup.txt'
]) invariant(attachments.has(name), `required attachment missing: ${name}`);

for (const name of ['trace', 'screenshot', 'video']) {
  const body = attachmentText(attachments.get(name));
  invariant(body.length > 0, `${name} must be non-empty`);
}
for (const name of ['server.stdout.log', 'sanitized-environment.md', 'browser-console.json', 'network-summary.json', 'runtime-identity.json', 'runtime-cleanup.txt']) {
  const body = attachmentText(attachments.get(name));
  invariant(body.length > 0, `${name} must be non-empty`);
  assertRedacted(name, body);
}
attachmentText(attachments.get('server.stderr.log'));

const cleanup = attachmentText(attachments.get('runtime-cleanup.txt')).toString('utf8');
invariant(/(?:^|\s)database=\S+/u.test(cleanup), 'cleanup evidence lacks the SQLite database path');
invariant(/(?:^|\s)cleanup=clean(?:\s|$)/u.test(cleanup), 'cleanup evidence is not clean');
invariant(!/(?:^|\s)cleanup=residue(?:\s|$)/u.test(cleanup), 'cleanup evidence reports residue');

const consoleSummary = JSON.parse(attachmentText(attachments.get('browser-console.json')).toString('utf8'));
const networkSummary = JSON.parse(attachmentText(attachments.get('network-summary.json')).toString('utf8'));
invariant(Array.isArray(consoleSummary), 'browser console summary must be an array');
invariant(Array.isArray(networkSummary) && networkSummary.length > 0, 'network summary must contain the real browser requests');

assertRedacted('standard JSON report', reportBody);
if (fs.existsSync(runInfoPath)) assertRedacted('sanitized runtime state', fs.readFileSync(runInfoPath));

console.log('RF-BUG-010 artifact proof verified: one intentional failure, complete standard artifacts, clean teardown, redacted diagnostics');
