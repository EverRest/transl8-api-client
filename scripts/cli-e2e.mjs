#!/usr/bin/env node
/**
 * P13-01 — `npm run cli-e2e`. Packs the package, installs the
 * tarball into a temp dir and drives the installed `transl8` bin
 * (`pkg.bin.transl8`) as a subprocess — the same file a registry install would
 * run (issue 193: the old shim-based e2e stayed green while the published bin
 * printed nothing). Network-free by design: a real
 * pull/push/status/publish run against a live tenant needs either
 * production credentials or gap 062's sandbox/test-mode keys (still open,
 * confirmed via `grep -rn "sandbox|ta_test_" backend/src` finding nothing)
 * — neither exists in CI or this environment, so this smoke covers the
 * CLI's own wiring (build output, argv parsing, exit codes, help text)
 * instead of faking a network success.
 *
 * Run `npm run build` first — this executes the built dist/cli.js, not the
 * TS source, same reasoning as review-sdk's verify-dist.mjs.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
let bin;

async function runCli(args, env = {}) {
  try {
    const { stdout, stderr } = await execFileAsync('node', [bin, ...args], {
      env: { ...process.env, ...env },
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
}

const checks = [];

function check(name, condition) {
  checks.push([name, Boolean(condition)]);
}

async function main() {
  if (!existsSync(join(packageRoot, 'dist', 'cli.js'))) {
    console.error('dist/cli.js not found — run "npm run build" first.');
    process.exit(1);
  }

  const work = mkdtempSync(join(tmpdir(), 'transl8-cli-e2e-'));
  try {
    const { stdout } = await execFileAsync(
      'npm',
      ['pack', '--json', '--pack-destination', work],
      { cwd: packageRoot },
    );
    const tarball = join(work, JSON.parse(stdout)[0].filename);
    await execFileAsync(
      'npm',
      ['install', '--prefix', work, '--ignore-scripts', '--no-audit', '--no-fund', tarball],
    );
    // Follow the package's own bin map, so a wrong path fails here.
    bin = join(work, 'node_modules', '@transl8.ai', 'api-client', pkg.bin.transl8);
    // npm 11 rewrites package.json when it publishes and warned `"bin[transl8]"
    // ... was invalid and removed` for the `./dist/cli.js` form (2.1.0 publish
    // log, 2026-10-18). A package whose bin is dropped installs no `transl8`
    // command, and a published version can never be replaced. Check the source
    // value (no leading `./`) and the installed copy of the packed package.json.
    const installed = JSON.parse(
      readFileSync(
        join(work, 'node_modules', '@transl8.ai', 'api-client', 'package.json'),
        'utf8',
      ),
    );
    check(
      'bin.transl8 has no leading ./ (npm 11 drops that form)',
      !String(pkg.bin?.transl8).startsWith('./'),
    );
    check(
      'the packed package.json keeps bin.transl8',
      typeof installed.bin?.transl8 === 'string',
    );
    await smoke();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function smoke() {
  const help = await runCli(['--help']);
  check('exits 0 on --help', help.code === 0);
  check('--help prints Usage', help.stdout.includes('Usage:'));
  check(
    '--help documents all four commands',
    ['pull', 'push', 'status', 'publish'].every((cmd) =>
      help.stdout.includes(`transl8 ${cmd}`),
    ),
  );

  const noArgs = await runCli([], { TRANSL8_API_KEY: undefined });
  check('exits 1 with no command', noArgs.code === 1);
  check('prints help with no command', noArgs.stdout.includes('Usage:'));

  const noKey = await runCli(['pull', 'proj', 'fr'], {
    TRANSL8_API_KEY: '',
  });
  check('exits 1 without an API key', noKey.code === 1);
  check(
    'names the missing-key problem, not a stack trace',
    noKey.stderr.includes('API key'),
  );

  const noHost = await runCli(['pull', 'proj', 'fr'], {
    TRANSL8_API_KEY: 'ta_live_x',
    TRANSL8_API_BASE_URL: '',
  });
  check('exits 1 without an API host', noHost.code === 1);
  check(
    'names the missing-host problem',
    noHost.stderr.includes(
      'transl8: set --api-base-url or TRANSL8_API_BASE_URL (the API host, for example https://api.example.com)',
    ),
  );

  const badUsage = await runCli(['pull'], {
    TRANSL8_API_KEY: 'ta_live_x',
    TRANSL8_API_BASE_URL: 'http://127.0.0.1:9',
  });
  check('exits 1 on missing positionals', badUsage.code === 1);
  check(
    'states the expected usage for the failing command',
    badUsage.stderr.includes('transl8 pull <project> <locale>'),
  );

  const unknown = await runCli(['frobnicate'], {
    TRANSL8_API_KEY: 'ta_live_x',
  });
  check('exits 1 on an unknown command', unknown.code === 1);

  // process.exit() right after one big stdout.write drops the unflushed
  // tail of a piped stdout on macOS (64 KB). A local server keeps this
  // network-free; execFile's stdout is a pipe, like `transl8 pull p fr | jq`.
  const bigBody = JSON.stringify({ k: 'x'.repeat(5 * 1024 * 1024) });
  const server = createServer((_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="fr.json"',
    });
    res.end(bigBody);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const bigPull = await runCli(
    ['pull', 'proj', 'fr', `--api-base-url=http://127.0.0.1:${server.address().port}`],
    { TRANSL8_API_KEY: 'ta_live_x' },
  );
  server.close();
  check('exits 0 on a large pull', bigPull.code === 0);
  check(
    'pipes a >64 KB export to stdout without truncation',
    bigPull.stdout.length === bigBody.length,
  );

  // B2: a 429 with Retry-After is waited out, the CLI says so on stderr.
  let hits = 0;
  const limited = createServer((_req, res) => {
    hits += 1;
    if (hits === 1) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '1' });
      res.end('{"success":false}');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="fr.json"',
    });
    res.end('{"a":"b"}');
  });
  await new Promise((resolve) => limited.listen(0, '127.0.0.1', resolve));
  const retried = await runCli(
    ['pull', 'proj', 'fr', `--api-base-url=http://127.0.0.1:${limited.address().port}`],
    { TRANSL8_API_KEY: 'ta_live_x' },
  );
  limited.close();
  check('exits 0 after a 429 + Retry-After', retried.code === 0 && hits === 2);
  check('prints the retry line on stderr', retried.stderr.includes('retry 1/3'));
  check('pipes the body after the retry', retried.stdout === '{"a":"b"}');

  for (const [name, ok] of checks) {
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`);
  }
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length > 0) {
    console.error(`\ncli-e2e failed: ${failed.map(([n]) => n).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('\ncli-e2e passed (network-free smoke — see doc comment for why).');
}

main();
