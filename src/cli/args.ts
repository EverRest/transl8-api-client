import { parseArgs } from 'node:util';

/**
 * P13-01 — the `transl8` CLI's arg shape: `transl8 <command> <positionals...>
 * [--flags]`. One shared flag schema across all four commands (pull/push/
 * status/publish) rather than a per-command one — `node:util.parseArgs`
 * doesn't error on flags a given command ignores, and a single schema is
 * less to maintain than four for a CLI this small (YAGNI).
 */
export type CliOptions = {
  format?: string;
  key?: string;
  apiBaseUrl?: string;
  project?: string;
  help: boolean;
};

export type ParsedCli = {
  command: string | undefined;
  positionals: string[];
  options: CliOptions;
};

export function parseCliArgs(argv: string[]): ParsedCli {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      format: { type: 'string' },
      key: { type: 'string' },
      'api-base-url': { type: 'string' },
      project: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  const [command, ...rest] = positionals;

  return {
    command,
    positionals: rest,
    options: {
      format: values.format,
      key: values.key,
      apiBaseUrl: values['api-base-url'],
      project: values.project,
      help: values.help ?? false,
    },
  };
}

/** `TRANSL8_API_KEY` env var is the documented default; `--key` overrides it. */
export function resolveApiKey(
  options: CliOptions,
  env: NodeJS.ProcessEnv,
): string | undefined {
  return options.key ?? env.TRANSL8_API_KEY;
}

/**
 * No default host: the CLI is open source and must not point at a host the
 * project does not control. The host has no `/api/v1` suffix — every generated
 * client function's URL already carries `/api/v1/...` itself (see
 * runtime/fetcher.ts's doc comment). Empty string counts as not set.
 */
export function resolveApiBaseUrl(
  options: CliOptions,
  env: NodeJS.ProcessEnv,
): string | undefined {
  return options.apiBaseUrl || env.TRANSL8_API_BASE_URL || undefined;
}
