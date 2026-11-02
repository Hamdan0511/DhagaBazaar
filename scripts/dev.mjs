#!/usr/bin/env node
/** Starts the API and the web client together with prefixed output. Ctrl+C stops both. */
import { spawn } from 'node:child_process';

const procs = [
  ['api', ['run', 'dev', '-w', 'server'], '\x1b[33m'],
  ['web', ['run', 'dev', '-w', 'client'], '\x1b[36m'],
].map(([name, args, colour]) => {
  const p = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { shell: process.platform === 'win32', env: process.env });
  const prefix = `${colour}[${name}]\x1b[0m `;
  const pipe = (stream, out) => stream.on('data', (d) => out.write(d.toString().replace(/^(?=.)/gm, prefix)));
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  p.on('exit', (code) => {
    console.log(`${prefix}exited with code ${code}`);
    procs.forEach((q) => q.kill());
    process.exit(code ?? 0);
  });
  return p;
});
process.on('SIGINT', () => procs.forEach((p) => p.kill()));
