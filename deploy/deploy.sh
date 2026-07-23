#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

echo "==> Pulling latest from GitHub..."
git pull origin main

echo "==> Installing dependencies..."
npm install

echo "==> Regenerating Prisma client..."
npx prisma generate

echo "==> Applying schema changes..."
npx prisma db push

echo "==> Building..."
npm run build

echo "==> Restarting..."
pm2 restart peptides-command-center || pm2 start ecosystem.config.js

echo "==> Deploy complete: $(date)"
