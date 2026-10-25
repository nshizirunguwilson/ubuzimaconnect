#!/usr/bin/env bash
# Builds the zip files Azure App Service runs (DECISIONS.md D67): .deploy/api.zip and .deploy/nida.zip.
# Each holds dist/main.js and only its production packages, so Azure runs it without building
# (SCM_DO_BUILD_DURING_DEPLOYMENT=false). argon2 ships a ready-built Linux binary, so no compiler is needed.
# The app sits in app/ inside the zip: Azure's startup script moves a top-level node_modules to /node_modules,
# where Node's ESM loader can't find it. The hoisted layout has no symlinks for the upload to lose.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf .deploy && mkdir -p .deploy
for app in api nida-mock; do
  pnpm --filter "@ubuzima/$app" build
  pnpm --filter "@ubuzima/$app" deploy --prod --legacy --config.node-linker=hoisted --config.auto-install-peers=false --config.strict-dep-builds=false ".deploy/$app/app"
  name=$([ "$app" = "nida-mock" ] && echo nida || echo api)
  (cd ".deploy/$app" && zip -qr "../$name.zip" .)
  echo "$name.zip: $(du -h ".deploy/$name.zip" | cut -f1)"
done
