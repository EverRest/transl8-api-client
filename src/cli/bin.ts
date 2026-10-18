// P13-01 — the executable entry point bundled into dist/cli.js (`pkg.bin.transl8`).
// All logic lives in ./main (typed, tested); this only wires real Node
// stdio/fs/env/argv into it.
import { readFile } from 'node:fs/promises';
import { run } from './main';

// No process.exit(): on a pipe (macOS) stdout writes are async, and exiting
// right after a big `pull` write drops everything past ~64 KB. Setting
// exitCode lets Node flush stdio and end when the event loop drains.
process.exitCode = await run({
  argv: process.argv.slice(2),
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  readFile,
});
