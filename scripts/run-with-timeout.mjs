#!/usr/bin/env node
import { spawn } from 'node:child_process';

const separator = process.argv.indexOf('--');
const timeoutMs = Number(process.argv[2]);
const command = separator >= 0 ? process.argv[separator + 1] : undefined;
const args = separator >= 0 ? process.argv.slice(separator + 2) : [];
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !command) {
  console.error('usage: run-with-timeout.mjs <milliseconds> -- <command> [args...]');
  process.exit(2);
}
const child = spawn(command, args, { stdio: 'inherit', env: process.env });
const timer = setTimeout(() => {
  child.kill('SIGTERM');
  setTimeout(() => child.kill('SIGKILL'), 2_000).unref();
}, timeoutMs);
timer.unref();
child.once('exit', (code, signal) => {
  clearTimeout(timer);
  process.exitCode = signal ? 124 : (code ?? 1);
});
child.once('error', (error) => {
  clearTimeout(timer);
  console.error(error.message);
  process.exitCode = 1;
});
