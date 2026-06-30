# Digital Solari �?Production Deployment Guide

You're ready to ship! Here's the step-by-step checklist to get **Digital Solari** live at `your-domain.com`.

---

## �?Phase 1: Code Hardening (DONE)

Code is production-ready:

- �?WebSocket scheme detects `https:` and uses `wss://` automatically
- �?QR code URL uses `https` in production, `http` in dev
- �?dotenv support for environment variables
- �?Sentry error monitoring (server + client)
- �?PostHog analytics (6 key events tracked)
- �?Supabase session persistence (survives restarts)

**Status:** All code changes committed to `main`.

---

## 📋 Phase 2: Manual Setup (Do These Next)

### Step 1: Create Supabase Account & Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up / Sign in
3. Create a new project (free tier is fine for start-up phase)
4. Copy your **Project URL** and **Service Role Key** (anon key is not enough �?use service role for server)
5. Save these securely

### Step 2: Create Supabase Schema

1. In your Supabase project dashboard, go to SQL Editor
2. Create a new query
3. Copy the entire contents of `scripts/supabase-schema.sql` and run it
4. Verify the table was created (check Tables section)

### Step 3: Create Sentry Account & Project

1. Go to [sentry.io](https://sentry.io)
2. Sign up / Sign in
3. Create a new project �?Node.js (server) + React/JavaScript (browser)
4. Copy your **DSN** for the Node.js project
5. You'll get separate DSNs for server and browser �?save both

### Step 4: Create PostHog Account & Project

1. Go to [posthog.com](https://posthog.com)
2. Sign up / Sign in
3. Create a new project
4. Copy your **Project API Key**
5. The host is always `https://app.posthog.com`

### Step 5: Domain Setup (Optional but Recommended)

1. Purchase domain at your registrar (e.g., Namecheap, Route53)
2. Once Railway is running (Step 6), you can point DNS to Railway's load balancer
   - Railway will give you a `*.railway.app` domain initially
   - You can add custom domain via Railway dashboard

---

## 🚀 Phase 3: Deploy to Railway

### Step 1: Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub (easier, auto-connects to your repos)
3. Create a new project

### Step 2: Connect GitHub Repo

1. In Railway, click "Deploy from GitHub repo"
2. Authorize Railway to access your GitHub
3. Select the `digital-solari` repository
4. Select `main` branch

### Step 3: Set Environment Variables

Railway will auto-detect `package.json` and start building. Before it starts, add these env vars:

**In Railway dashboard �?Project Settings �?Environment:**

```
NODE_ENV=production
PORT=3000
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
SENTRY_DSN=https://xxxx@xxxx.ingest.sentry.io/xxxx
VITE_POSTHOG_KEY=phc_xxx
VITE_POSTHOG_HOST=https://app.posthog.com
```

**Replace the values with what you copied in Step 2 above.**

### Step 4: Watch Deployment

Railway will:

1. Detect Node.js project
2. Run `npm install`
3. Run `node server/index.js` (via `railway.toml`)
4. Show you a live logs stream

Once you see `Digital Solari running on http://localhost:3000`, the app is live!

Railway will give you a public URL like: `https://digital-solari-prod-xxxxx.railway.app`

### Step 5: Add Custom Domain

1. In Railway dashboard, go to your service settings
2. Add a custom domain: `your-domain.com`
3. Railway provisions SSL automatically
4. Point your domain's DNS to Railway's load balancer (Railway shows the CNAME)
5. Wait ~5 min for DNS to propagate

---

## 🔍 Phase 4: Verify Everything Works

### Test the Live App

1. Open `https://your-domain.com` in browser
2. You should see the homepage
3. Click "Connect Board" �?you get a board at `https://your-domain.com/board`
4. Phone: scan QR code or visit `https://your-domain.com/controller?code=XXXXXX`
5. Send a message �?should flip on the board

### Check Monitoring Dashboards

**Sentry (Error Tracking):**

- Go to your Sentry project
- You should see errors (if any) from your app
- Browser errors will show up in the "Errors" tab

**PostHog (Analytics):**

- Go to your PostHog project
- You should see events: `board_connected`, `message_sent`, etc.
- Check the "Insights" tab to see usage patterns

**Supabase (Session Storage):**

- Go to Supabase dashboard
- Check "Sessions" table
- You should see rows with `pair_code`, `state`, `current_rows`
- Rows persist across server restarts

---

## 🛡�?Optional: Add SSL/TLS (Already Done by Railway)

Railway auto-provisions SSL for both:

- `https://digital-solari-prod-xxxxx.railway.app`
- `https://your-domain.com` (after you add custom domain)

No action needed on your part.

---

## 📝 Env Var Reference

| Var                         | Where to Get                      | Notes                               |
| --------------------------- | --------------------------------- | ----------------------------------- |
| `NODE_ENV`                  | Set to `production`               | Controls scheme logic               |
| `PORT`                      | Railway sets to `3000` by default | Can change if needed                |
| `SUPABASE_URL`              | Supabase dashboard �?Settings     | Format: `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase �?Settings �?API Keys    | **Not** the anon key                |
| `SENTRY_DSN`                | Sentry project �?Settings         | Server DSN (Node.js)                |
| `VITE_POSTHOG_KEY`          | PostHog �?Project Settings        | Project API key                     |
| `VITE_POSTHOG_HOST`         | Always `https://app.posthog.com`  | Hardcoded in most cases             |

---

## 🐛 Troubleshooting

### Board won't connect

- Check Railway logs for errors
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct
- Verify Supabase `sessions` table exists

### WebSocket shows `ws://` instead of `wss://`

- The code auto-detects; make sure you're on `https://your-domain.com` not `http://`
- Check browser DevTools �?Network �?WS/WSS column

### QR code doesn't work

- Make sure `NODE_ENV=production` is set in Railway
- Check the QR image URL in the browser

### Events don't appear in PostHog

- Check if `VITE_POSTHOG_KEY` is set
- Make sure you're not on `localhost` (PostHog only initializes on production domains)
- Check browser console for errors

---

## 📊 Monitoring & Maintenance

Once live, monitor:

1. **Sentry Dashboard** �?errors are grouped by type; set up alerts for critical errors
2. **PostHog Insights** �?track user engagement, session duration, features used
3. **Railway Logs** �?watch for WebSocket disconnections or DB errors
4. **Supabase Dashboard** �?check session count, last_active timestamps

All three services have free tiers suitable for MVP phase.

---

## 🚀 Next Steps (Future)

- Add authentication to admin the pair codes (optional)
- Set up backups for Supabase
- Configure CloudFlare for DDoS protection
- Monitor bandwidth usage
- Scale horizontally if needed (Railway supports auto-scaling)

---

## 📞 Quick Recap: What Was Changed

### Code Changes (already committed)

- **Phase 1:** WebSocket scheme + QR URL scheme + dotenv
- **Phase 2:** Supabase persistence layer (sessionManager.js)
- **Phase 3:** Sentry error monitoring (server + 3 HTML files)
- **Phase 4:** PostHog analytics (6 events tracked in 2 JS files)
- **Phase 5:** Railway deployment config (railway.toml)

### Manual Setup (you do these)

1. Create Supabase project & schema
2. Create Sentry project
3. Create PostHog project
4. Create Railway project & connect GitHub
5. Set environment variables in Railway
6. (Optional) Add custom domain `your-domain.com`

### Result

**Your app is live at `your-domain.com` with:**

- Persistent sessions (survive restarts)
- Error tracking (Sentry)
- Usage analytics (PostHog)
- Auto-scaling Node.js server (Railway)
- SSL/TLS (free, auto-provisioned)

Good luck! 🎉
