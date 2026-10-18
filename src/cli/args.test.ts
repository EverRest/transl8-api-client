import { describe, expect, it } from 'vitest';
import { parseCliArgs, resolveApiBaseUrl, resolveApiKey } from './args';

describe('parseCliArgs', () => {
  it('splits the command from its positionals', () => {
    const parsed = parseCliArgs(['pull', 'my-project', 'fr']);

    expect(parsed.command).toBe('pull');
    expect(parsed.positionals).toEqual(['my-project', 'fr']);
  });

  it('parses --flag=value style options', () => {
    const parsed = parseCliArgs(['pull', 'p', 'fr', '--format=json', '--key=ta_live_x']);

    expect(parsed.options.format).toBe('json');
    expect(parsed.options.key).toBe('ta_live_x');
  });

  it('maps --api-base-url to apiBaseUrl', () => {
    const parsed = parseCliArgs(['status', 'job_1', '--api-base-url=https://x.test']);

    expect(parsed.options.apiBaseUrl).toBe('https://x.test');
  });

  it('recognises -h and --help', () => {
    expect(parseCliArgs(['-h']).options.help).toBe(true);
    expect(parseCliArgs(['--help']).options.help).toBe(true);
    expect(parseCliArgs(['pull']).options.help).toBe(false);
  });

  it('has no command when given no arguments', () => {
    expect(parseCliArgs([]).command).toBeUndefined();
  });
});

describe('resolveApiKey', () => {
  it('prefers --key over TRANSL8_API_KEY', () => {
    const key = resolveApiKey(
      { key: 'from-flag', help: false },
      { TRANSL8_API_KEY: 'from-env' },
    );
    expect(key).toBe('from-flag');
  });

  it('falls back to TRANSL8_API_KEY when --key is absent', () => {
    const key = resolveApiKey({ help: false }, { TRANSL8_API_KEY: 'from-env' });
    expect(key).toBe('from-env');
  });

  it('is undefined when neither is set', () => {
    expect(resolveApiKey({ help: false }, {})).toBeUndefined();
  });
});

describe('resolveApiBaseUrl', () => {
  it('prefers --api-base-url over the env var', () => {
    const url = resolveApiBaseUrl(
      { apiBaseUrl: 'https://flag.test', help: false },
      { TRANSL8_API_BASE_URL: 'https://env.test' },
    );
    expect(url).toBe('https://flag.test');
  });

  it('falls back to TRANSL8_API_BASE_URL', () => {
    const url = resolveApiBaseUrl(
      { help: false },
      { TRANSL8_API_BASE_URL: 'https://env.test' },
    );
    expect(url).toBe('https://env.test');
  });

  it('is undefined when nothing is set (no default host)', () => {
    expect(resolveApiBaseUrl({ help: false }, {})).toBeUndefined();
  });

  it('treats an empty flag or env value as not set', () => {
    expect(resolveApiBaseUrl({ apiBaseUrl: '', help: false }, {})).toBeUndefined();
    expect(
      resolveApiBaseUrl({ help: false }, { TRANSL8_API_BASE_URL: '' }),
    ).toBeUndefined();
  });
});
