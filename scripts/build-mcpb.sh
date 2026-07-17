#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cli_root="${GDOC_CLI_ROOT:-$repo_root/../cli}"
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

rm -rf "$repo_root/build" "$repo_root/mcpb/bin" "$repo_root/mcpb/server" "$repo_root/mcpb/node_modules"
mkdir -p "$repo_root/build" "$repo_root/dist" "$repo_root/mcpb/bin"

uv run --directory "$cli_root" --with pyinstaller pyinstaller \
  --clean --noconfirm --onefile --name "gdoc-$node_arch" \
  --distpath "$repo_root/mcpb/bin" --workpath "$repo_root/build/pyinstaller" \
  --specpath "$repo_root/build" "$cli_root/gdoc/__main__.py"

cp -R "$repo_root/server" "$repo_root/mcpb/server"
npm --prefix "$repo_root" ci --omit=dev --silent
cp -R "$repo_root/node_modules" "$repo_root/mcpb/node_modules"
npx --yes @anthropic-ai/mcpb@2.1.2 pack "$repo_root/mcpb" "$repo_root/dist/gdoc-$node_arch.mcpb"
echo "built $repo_root/dist/gdoc-$node_arch.mcpb"
