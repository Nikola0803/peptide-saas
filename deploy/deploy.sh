#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

echo "==> Pulling latest from GitHub..."
git pull origin main

echo "==> Installing dependencies..."
npm install

echo "==> Regenerating Prisma client..."
npx prisma generate

echo "==> Building..."
npm run build

echo "==> Applying schema changes..."
npx prisma db push

if [ "${SYNC_EMAIL_TEMPLATES:-1}" != "0" ]; then
  echo "==> Syncing EVLV email templates..."
  npm run email:sync-defaults
else
  echo "==> Skipping email template sync (SYNC_EMAIL_TEMPLATES=0)"
fi

echo "==> Restarting..."
pm2 restart peptides-command-center || pm2 start ecosystem.config.js

echo "==> Deploy complete: $(date)"
