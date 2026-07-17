#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cli_root="${GDOC_CLI_ROOT:-$repo_root/../cli}"
profile_name="${1:-}"
oauth_credentials="${2:-}"
profile_path="$repo_root/profiles/$profile_name.json"

if [[ -z "$profile_name" || -z "$oauth_credentials" ]]; then
  echo "usage: $0 <personal|80000hours> /path/to/google-desktop-oauth-client.json" >&2
  exit 2
fi
test -f "$profile_path" || {
  echo "unknown build profile: $profile_name" >&2
  exit 2
}
test -f "$oauth_credentials" || {
  echo "OAuth client file not found: $oauth_credentials" >&2
  exit 2
}

# Validate without printing credential values. Desktop OAuth clients are
# distributable identifiers rather than trustworthy secrets, but profile
# bundles remain private because the file identifies the owning Cloud project.
node -e '
  const fs = require("fs");
  const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const client = value.installed;
  if (!client?.client_id || !client?.client_secret || !client?.auth_uri || !client?.token_uri) {
    throw new Error("expected a Google Desktop OAuth client in the installed section");
  }
' "$oauth_credentials"

arch="$(uname -m)"
case "$arch" in
  arm64) node_arch="arm64" ;;
  x86_64) node_arch="x64" ;;
  *) echo "unsupported macOS architecture: $arch" >&2; exit 1 ;;
esac

test -f "$cli_root/pyproject.toml" || {
  echo "gdoc CLI source not found at $cli_root; set GDOC_CLI_ROOT" >&2
  exit 1
}

stage="$repo_root/build/mcpb-$profile_name"
rm -rf "$repo_root/build"
mkdir -p "$repo_root/build" "$repo_root/dist" "$stage/bin" "$stage/config"

uv run --directory "$cli_root" --with pyinstaller pyinstaller \
  --clean --noconfirm --onefile --name "gdoc-$node_arch" \
  --distpath "$stage/bin" --workpath "$repo_root/build/pyinstaller" \
  --specpath "$repo_root/build" "$cli_root/gdoc/__main__.py"

cp "$repo_root/mcpb/manifest.json" "$stage/manifest.json"
cp "$repo_root/mcpb/package.json" "$stage/package.json"
cp "$repo_root/mcpb/.mcpbignore" "$stage/.mcpbignore"
cp -R "$repo_root/server" "$stage/server"
cp "$profile_path" "$stage/config/profile.json"
cp "$oauth_credentials" "$stage/config/oauth-client.json"
chmod 600 "$stage/config/oauth-client.json"

PROFILE_PATH="$profile_path" MANIFEST_PATH="$stage/manifest.json" node --input-type=module <<'NODE'
import fs from "node:fs";
const profile = JSON.parse(fs.readFileSync(process.env.PROFILE_PATH, "utf8"));
const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST_PATH, "utf8"));
manifest.name = profile.name;
manifest.display_name = profile.display_name;
fs.writeFileSync(process.env.MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
NODE

npm --prefix "$repo_root" ci --omit=dev --silent
cp -R "$repo_root/node_modules" "$stage/node_modules"
output="$repo_root/dist/gdoc-$profile_name-$node_arch.mcpb"
npx --yes @anthropic-ai/mcpb@2.1.2 pack "$stage" "$output"
echo "built private profile bundle: $output"
