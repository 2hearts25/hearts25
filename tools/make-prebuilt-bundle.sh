#!/usr/bin/env bash
# Build the site and assemble a prebuilt Netlify deploy bundle (dist + no-op build + netlify.toml).
# Usage: H2H_PUBLIC_ANON_KEY=<anon key> tools/make-prebuilt-bundle.sh [output-dir]
set -euo pipefail
cd "$(dirname "$0")/.."
: "${H2H_PUBLIC_ANON_KEY:?Set H2H_PUBLIC_ANON_KEY to the public Supabase anon key (never the service_role key)}"
out="${1:-/tmp/h2h-deploy}"
node build.mjs
rm -rf "$out"; mkdir -p "$out"
cp -R dist "$out/dist"
printf '// Prebuilt deploy: dist/ was built before upload, so Netlify has nothing to build.\nconsole.log("prebuilt dist; nothing to build");\n' > "$out/build.mjs"
printf '[build]\n  command = "node build.mjs"\n  publish = "dist"\n\n[build.environment]\n  NODE_VERSION = "22"\n' > "$out/netlify.toml"
echo "Bundle ready: $out"
