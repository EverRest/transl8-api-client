import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as esbuild from 'esbuild';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(packageRoot, 'dist');
const entryPoint = path.join(packageRoot, 'src', 'index.ts');
const cliEntryPoint = path.join(packageRoot, 'src', 'cli', 'bin.ts');

async function main() {
  await rm(distDir, { recursive: true, force: true });

  await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    sourcemap: true,
    target: 'es2020',
    format: 'esm',
    platform: 'neutral',
    outfile: path.join(distDir, 'index.js'),
    logLevel: 'info',
  });

  // P13-01 — the `transl8` CLI (`pkg.bin.transl8`; src/cli/bin.ts calls run()). `platform:
  // 'node'` unlike the browser-neutral build above: the CLI reads files and
  // env vars, which the neutral build's target consumers (browsers) can't.
  await esbuild.build({
    entryPoints: [cliEntryPoint],
    bundle: true,
    sourcemap: true,
    target: 'node22',
    format: 'esm',
    platform: 'node',
    banner: { js: '#!/usr/bin/env node' },
    outfile: path.join(distDir, 'cli.js'),
    logLevel: 'info',
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
