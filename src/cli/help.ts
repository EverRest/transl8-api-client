export const HELP_TEXT = `transl8 — CLI for the transl8.ai translation API (@transl8.ai/api-client)

Usage:
  transl8 pull <project> <locale> [--format=json]   Export a locale's translations to stdout
  transl8 push <file> --project=<project>           Import a file's strings, then apply the session
  transl8 status <jobId>                            Poll a translation job until it finishes
  transl8 publish <project> <locale>                Publish all approved translations for a locale

Options:
  --key=<key>            Project API key (default: $TRANSL8_API_KEY)
  --api-base-url=<url>   API host, no /api/v1 (required; or set $TRANSL8_API_BASE_URL)
  --format=<format>      Export format for "pull" (default: json)
  --project=<id>         Project id (required for "push")
  -h, --help             Show this help

Examples:
  transl8 pull my-project fr --format=json > fr.json
  transl8 push fr.json --project=my-project
  transl8 status job_abc123
  transl8 publish my-project fr

Large exports: "pull" of a locale over 1000 rows starts an async export job, which
needs an API key with the exports:write scope (exports:read alone covers smaller locales).

Auth: set TRANSL8_API_KEY, or pass --key=ta_live_...
`;
