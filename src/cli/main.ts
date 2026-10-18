import { basename } from 'node:path';
import { configureApiClient } from '../runtime/config';
import { ApiError } from '../runtime/errors';
import { parseCliArgs, resolveApiBaseUrl, resolveApiKey } from './args';
import { HELP_TEXT } from './help';
import { pull } from './commands/pull';
import { push } from './commands/push';
import { publish } from './commands/publish';
import { status } from './commands/status';

/** Injectable IO so `run()` is testable without touching real stdio/network. */
export type CliIo = {
  argv: string[];
  env: NodeJS.ProcessEnv;
  stdout: { write(chunk: string | Uint8Array): void };
  stderr: { write(chunk: string): void };
  readFile: (path: string) => Promise<Uint8Array>;
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.message} (${error.code}, HTTP ${error.status}${error.traceId ? `, trace ${error.traceId}` : ''})`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Exit code: 0 success, 1 usage/runtime error. Never throws — every path returns a code. */
export async function run(io: CliIo): Promise<number> {
  const parsed = parseCliArgs(io.argv);

  if (parsed.options.help) {
    io.stdout.write(HELP_TEXT);
    return 0;
  }
  if (!parsed.command) {
    io.stdout.write(HELP_TEXT);
    return 1;
  }

  if (!['pull', 'push', 'status', 'publish'].includes(parsed.command)) {
    io.stderr.write(`transl8: unknown command "${parsed.command}"\n\n`);
    io.stdout.write(HELP_TEXT);
    return 1;
  }

  const apiKey = resolveApiKey(parsed.options, io.env);
  if (!apiKey) {
    io.stderr.write(
      'transl8: missing API key — set TRANSL8_API_KEY or pass --key=...\n',
    );
    return 1;
  }
  const baseUrl = resolveApiBaseUrl(parsed.options, io.env);
  if (!baseUrl) {
    io.stderr.write(
      'transl8: set --api-base-url or TRANSL8_API_BASE_URL (the API host, for example https://api.example.com)\n',
    );
    return 1;
  }
  configureApiClient({
    baseUrl,
    getAuthToken: () => apiKey,
    onRetry: ({ status, waitMs, attempt, max }) =>
      io.stderr.write(
        `transl8: API answered ${status}, retry ${attempt}/${max} in ${Math.ceil(waitMs / 1000)} s\n`,
      ),
  });

  try {
    switch (parsed.command) {
      case 'pull': {
        const [project, locale] = parsed.positionals;
        if (!project || !locale) {
          io.stderr.write('transl8: usage: transl8 pull <project> <locale>\n');
          return 1;
        }
        const blob = await pull({
          project,
          locale,
          format: parsed.options.format,
          onPoll: (j) =>
            io.stderr.write(`transl8: export job ${j.id} — ${j.exportStatus}\n`),
        });
        io.stdout.write(new Uint8Array(await blob.arrayBuffer()));
        return 0;
      }
      case 'push': {
        const [file] = parsed.positionals;
        if (!file || !parsed.options.project) {
          io.stderr.write(
            'transl8: usage: transl8 push <file> --project=<project>\n',
          );
          return 1;
        }
        const bytes = await io.readFile(file);
        const result = await push({
          project: parsed.options.project,
          // TS's lib.dom BlobPart type wants ArrayBufferView<ArrayBuffer>
          // specifically, excluding the (here purely theoretical) possibility
          // of a Uint8Array backed by a SharedArrayBuffer — real readFile()
          // output is never that.
          fileContents: new Blob([bytes as BlobPart]),
          fileName: basename(file),
        });
        io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return 0;
      }
      case 'status': {
        const [jobId] = parsed.positionals;
        if (!jobId) {
          io.stderr.write('transl8: usage: transl8 status <jobId>\n');
          return 1;
        }
        const job = await status({
          jobId,
          onPoll: (j) => io.stderr.write(`transl8: job ${j.id} — ${j.status}\n`),
        });
        io.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
        return 0;
      }
      case 'publish': {
        const [project, locale] = parsed.positionals;
        if (!project || !locale) {
          io.stderr.write('transl8: usage: transl8 publish <project> <locale>\n');
          return 1;
        }
        const result = await publish({ project, locale });
        io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return 0;
      }
      default:
        // Unreachable — the includes() check above already filtered to these four.
        return 1;
    }
  } catch (error) {
    io.stderr.write(`transl8: ${errorMessage(error)}\n`);
    return 1;
  }
}
