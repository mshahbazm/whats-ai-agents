#!/bin/sh
# Builds and deploys to Cloudflare without baking .env.local into the Worker.
# OpenNext copies .env files into the server bundle; on Cloudflare the real
# values come from `wrangler secret`, so the file is moved aside during the build.
set -e
cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  mv .env.local .env.local.deploying
  trap 'mv .env.local.deploying .env.local' EXIT
fi

rm -rf .open-next
opennextjs-cloudflare build
opennextjs-cloudflare deploy
