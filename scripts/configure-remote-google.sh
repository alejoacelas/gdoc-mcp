#!/usr/bin/env bash
set -euo pipefail

credentials_file="${1:-}"
app="${2:-gdoc-mcp-alejo}"
callback="https://${app}.fly.dev/oauth/google/callback"

if [[ -z "$credentials_file" ]]; then
  echo "Usage: $0 /path/to/google-web-oauth-client.json [fly-app]" >&2
  exit 2
fi

for command in jq flyctl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 2
  fi
done

if [[ ! -f "$credentials_file" ]]; then
  echo "Credential file not found: $credentials_file" >&2
  exit 2
fi

if ! jq -e --arg callback "$callback" '
  .web.client_id != null and
  .web.client_secret != null and
  any(.web.redirect_uris[]?; . == $callback)
' "$credentials_file" >/dev/null; then
  echo "Expected a Google Web OAuth client containing this redirect URI:" >&2
  echo "$callback" >&2
  exit 2
fi

client_id="$(jq -r '.web.client_id' "$credentials_file")"
client_secret="$(jq -r '.web.client_secret' "$credentials_file")"

printf 'GOOGLE_CLIENT_ID=%s\nGOOGLE_CLIENT_SECRET=%s\n' \
  "$client_id" "$client_secret" |
  flyctl secrets import --app "$app"

curl --fail --silent --show-error --retry 5 --retry-delay 2 \
  "https://${app}.fly.dev/health"
echo
echo "Google Web OAuth client installed for $app."
