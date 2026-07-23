# Peptide Command Center

A multi-brand CRM/command-center for a network of WooCommerce peptide
stores, rebuilt from a readdy.ai design mockup into a real, multi-tenant
Next.js SaaS with a companion WordPress plugin.

## What's here

- **`/src`** — Next.js 14 (App Router) + TypeScript + Tailwind app.
  Multi-tenant from the schema up (`Organization` → `Brand` →
  products/orders/contacts/affiliates), so it works both as an internal
  tool and as something you resell to other store owners.
- **`/prisma/schema.prisma`** — the full data model.
- **`/prisma/seed.ts`** — demo data (3 brands, sample orders/contacts/
  affiliates) matching the original mockup, so you can click through a
  populated dashboard immediately.
- **`/wp-plugin/command-center-connector`** — the WordPress plugin.
  Installed on each brand's WooCommerce site, it:
  1. **Self-registers the site** as a new Brand using your org's API key
     (Settings → Command Center in WP admin) — this is the "automatic
     recognition of new websites": no manual step in the dashboard.
  2. **Auto-configures native WooCommerce webhooks** (order.created,
     order.updated) pointed at your Command Center, signed the same way
     WooCommerce signs any webhook (`X-WC-Webhook-Signature`).
  3. **Backfills existing products & orders** on first connect, and again
     on a twice-daily cron job as a reconciliation safety net — this is
     the "auto sync".
- **`/scripts/build-plugin-zip.ts`** — zips the plugin into
  `public/downloads/command-center-connector.zip` on every build, so the
  in-app "Download WordPress plugin" button always serves the current
  version.

## Local setup

```bash
cp .env.example .env
# edit .env — DATABASE_URL, NEXTAUTH_SECRET (openssl rand -base64 32)

npm install
npm run db:push      # creates tables from schema.prisma
npm run db:seed      # demo org + brands + orders
npm run dev
```

Sign in with the seeded demo account: `operator@example.com` /
`password123`.

## Database hosting

Decided: self-hosted Postgres on the same VPS as the app — see
"Deploying to your own VPS" below for the exact setup. The schema is
plain PostgreSQL with no vendor-specific features, so nothing here is
locked in if that ever changes.

## Connecting a WooCommerce store

1. Deploy this app somewhere reachable over HTTPS (webhooks need a real
   URL — `localhost` won't work for a live store).
2. Sign in, go to **Webhooks**, copy the **Organization API key**.
3. Download and install `command-center-connector.zip` on the
   WooCommerce site.
4. In WP admin: **Settings → Command Center** → paste the Command Center
   URL + API key → **Connect this site**.

The new brand appears on the Webhooks/Dashboard pages within seconds.

## Tracking & Pixels (conversion tracking + ad platform relay)

Each brand gets an embeddable snippet (`/tracking-pixels` page → copy the
`<script>` tag) that:

- Sets a first-party visitor-id cookie on the brand's own domain
- Auto-fires a `page_view` on load
- Exposes `window.cc('track', 'purchase', { valueCents, currency, email })`
  to call from a checkout thank-you page (or `add_to_cart`, `lead`, etc.)

Every event lands in `TrackingEvent` and is immediately relayed
server-side — fire-and-forget, doesn't block the visitor's request — to
whichever of Meta Conversions API / TikTok Events API / GA4 Measurement
Protocol the brand has configured (`TrackingConfig`, edited from the same
page). Server-side relay matters because it still attributes the
conversion even when the visitor's browser or an ad-blocker kills the
client-side pixel — that's the "share with other tools" piece.

**Not done yet here:** hashing/matching quality could go further (e.g.
phone number, first/last name for better Meta match rate), there's no
retry queue for a relay that fails (it just logs `relayError` on the
event and moves on), and the WooCommerce order webhook doesn't yet
auto-fire a server-side `purchase` event on its own — right now that only
happens if the storefront's thank-you page calls `window.cc(...)`
directly.

## Deploying to your own VPS

Runs the whole app — Next.js and Postgres — on one Ubuntu box, same
pattern as Mashiach Tech. The database never touches the public internet:
the app talks to it over `localhost`, so there's no connection pooling
complexity, no cold starts, and nothing to expose or firewall for
Postgres itself.

```bash
# --- one-time server setup ---
sudo apt update
sudo apt install -y postgresql postgresql-contrib nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# --- create the database + a dedicated (non-superuser) app role ---
sudo -u postgres psql -c "CREATE USER cc_app WITH PASSWORD 'a-strong-random-password';"
sudo -u postgres psql -c "CREATE DATABASE peptides_crm OWNER cc_app;"

# --- get the app onto the box (pick one) ---
# scp the zip up and unzip, or clone from your own git remote
cd /var/www/peptides-command-center
npm install

# --- configure ---
cp .env.example .env
nano .env
# DATABASE_URL / DIRECT_URL = postgresql://cc_app:<password>@localhost:5432/peptides_crm
# NEXTAUTH_URL = https://your-domain.com
# NEXTAUTH_SECRET = node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# --- build + first-time schema/seed ---
npm run db:push
npm run db:seed     # optional — demo data; skip once you have real brands
npm run build

# --- run it, keep it running across reboots ---
pm2 start ecosystem.config.js
pm2 save
pm2 startup        # follow the one printed command to enable on boot

# --- put nginx + TLS in front ---
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/peptides-command-center
sudo nano /etc/nginx/sites-available/peptides-command-center   # set server_name
sudo ln -s /etc/nginx/sites-available/peptides-command-center /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

Point your domain's DNS at the VPS, and that's it — `https://your-domain.com`
is the app, and it's also the base URL you'll use for the WordPress
plugin's "Command Center URL" field and the `/pixel.js` embed snippets
(both need a real HTTPS URL, `localhost` won't work for either).

**Redeploying after a code change:**
```bash
git pull   # or re-upload
npm install
npx prisma generate
npm run build
pm2 restart peptides-command-center
```

**Backups** — this is on you now that Postgres isn't managed for you:
```bash
# simple daily dump via cron
pg_dump -U cc_app peptides_crm | gzip > /var/backups/peptides_crm_$(date +%F).sql.gz
```

## Performance

The dashboard streams in independent pieces (`Suspense` per section —
KPIs, revenue chart, funnel, recent orders, brands panel) so one slow
query doesn't block the whole page from rendering.

**If you're seeing repeated `prisma:error Error in PostgreSQL connection:
Error { kind: Closed, cause: None }` in the terminal**, that's Neon
closing an idle connection that Prisma's engine is still holding — it
happens on a *direct* connection after any pause (dev server sitting
idle for a few minutes, which is constant during normal use). Fix:
point `DATABASE_URL` at Neon's **pooled** endpoint (dashboard →
Connection Details → toggle "Pooled connection", hostname will contain
`-pooler`) with `?pgbouncer=true&connect_timeout=15` appended, and set
`DIRECT_URL` to the plain (non-pooled) connection string for
`prisma db push`/`migrate` only — see the comments in `.env.example` for
the exact shape. PgBouncer sitting in front absorbs Neon's idle
disconnects so Prisma never hits a connection it thinks is still open but
isn't.

**If you see `[next-auth][warn][NEXTAUTH_URL]`**, `NEXTAUTH_URL` in
`.env` is missing, wrong, or wasn't picked up — Next.js does not
hot-reload `.env` changes, so edit it, then fully stop and restart
`npm run dev` (not just save the file).

Beyond those two: `npm run dev` is meaningfully slower than production —
always sanity-check perceived speed with `npm run build && npm run
start` before concluding something's actually wrong. And the schema has
indexes on the columns every page actually filters/sorts by
(`Order(organizationId, placedAt)`, `Order(brandId, placedAt)`,
`Product(organizationId, masterStock)`, `Contact(organizationId,
createdAt)`, `TrackingEvent(organizationId, createdAt)`) — if query
latency is still the bottleneck on a warm, pooled connection,
`npx prisma studio` plus `EXPLAIN ANALYZE` on the slow query is the next
thing to check, not more indexes blindly.

## What's NOT built yet

- **Multi-org signup/onboarding flow.** Right now organizations only
  exist via the seed script or direct DB inserts — there's no public
  "create your account" page. Needed before this can actually be sold.
- **Billing** (Stripe subscriptions tied to `Organization.plan`).
- **Variable-product / variation support** in the plugin's product sync
  (currently simple products only, matched by SKU).
- **Order edits/refunds after the fact** — the webhook handler upserts an
  order's status and totals on re-delivery, but doesn't currently re-diff
  line items, so a partial refund that changes quantities won't be
  reflected in `OrderItem` rows.
- **Shipping, Payments, Email Marketing, Social Analytics, AI Blog Tool,
  Reddit Marketing** — still placeholders with a description of what
  they'll do, matching the mockup's structure, no logic behind them yet.
  (Tracking & Pixels is now fully implemented — see above.)
- **Real merchant fee configuration** — the profit calculation assumes a
  flat 2.9% + $0.30 processor fee; make this configurable per brand
  before trusting the net profit numbers.
- **Team invitations** — `Membership`/`Role` exist in the schema, but
  there's no UI to invite a second user into an organization yet.
