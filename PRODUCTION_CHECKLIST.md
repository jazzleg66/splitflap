# 🚀 Production Launch Checklist

## Code Ready ✅
- [x] Phase 1: WebSocket scheme + QR URL + dotenv + Sentry + PostHog
- [x] Phase 2: Supabase session persistence 
- [x] Phase 3: Sentry error monitoring
- [x] Phase 4: PostHog analytics (6 events)
- [x] Phase 5: Railway deployment config
- [x] All changes committed to `main` branch

**Status:** Ready to push!

---

## Your Tasks (in order)

### ✅ 1. Supabase Setup (15 min)
- [x] Create Supabase account at supabase.com
- [x] Create a new project (free tier)
- [x] Copy Project URL
- [x] Copy Service Role Key (not anon key!)
- [x] Go to SQL Editor → paste `scripts/supabase-schema.sql` → run
- [x] Verify `sessions` table was created
- [x] Save credentials securely

### ✅ 2. Sentry Setup (10 min)
- [x] Create Sentry account at sentry.io
- [x] Create new project → choose "Node.js" for server
- [x] Copy the DSN
- [ ] (Optional) Create browser project for client-side errors
- [x] Save credentials securely

### ✅ 3. PostHog Setup (5 min)
- [x] Create PostHog account at posthog.com
- [x] Create new project
- [x] Copy Project API Key
- [x] Note the host: `https://app.posthog.com`
- [x] Save credentials

### 🟦 4. Render Setup (10 min) — **BLOCKED: Waiting for credit card**
- [ ] Create Render account at render.com (sign in with GitHub)
- [ ] Create new Web Service
- [ ] Connect `digital-solari` repository
- [ ] Select `main` branch
- [ ] **Add environment variables:**
  ```
  NODE_ENV=production
  SUPABASE_URL=<from step 1>
  SUPABASE_SERVICE_ROLE_KEY=<from step 1>
  SENTRY_DSN=<from step 2>
  VITE_POSTHOG_KEY=<from step 3>
  VITE_POSTHOG_HOST=https://app.posthog.com
  ```
- [ ] Set Build Command: `npm install`
- [ ] Set Start Command: `npm start`
- [ ] Deploy and watch logs until "Server running on port 3000"
- [ ] Copy the Render public URL (e.g., `https://digital-solari.onrender.com`)

### 🟦 5. Domain Setup (Optional, 5 min)
- [ ] Purchase domain (if not already owned) — suggest `splitflap.cc`
- [ ] In Railway dashboard → add custom domain
- [ ] Follow Railway's DNS instructions (usually a CNAME)
- [ ] Wait 5–10 min for DNS propagation
- [ ] Test: visit `https://splitflap.cc` ✓

### 🟦 6. Verification (10 min)
- [ ] Open the app: `https://splitflap.cc` (or Railway URL)
- [ ] Homepage loads ✓
- [ ] Click "Connect Board" → `/board` loads ✓
- [ ] QR code visible ✓
- [ ] Scan QR or open controller in new window
- [ ] Send a message — board updates ✓
- [ ] Check Sentry dashboard — no critical errors ✓
- [ ] Check PostHog dashboard — events appearing ✓
- [ ] Check Supabase dashboard — sessions table has rows ✓

### 🟦 7. Final Checks
- [ ] Browser DevTools Network tab shows `wss://` (not `ws://`)
- [ ] HTTPS working (no "mixed content" warnings)
- [ ] Mobile phone can connect via QR code
- [ ] All three pages (`/`, `/board`, `/controller`) load

---

## Progress
- **Code:** ✅ Done
- **Setup:** 
  - ✅ Supabase (complete)
  - ✅ Sentry (complete)
  - ✅ PostHog (complete)
  - 🟦 Render (blocked — credit card needed)
- **Verification:** Pending
- **Estimated time to complete:** ~20 min once credit card available (Render deploy + verification)

---

## If Something Goes Wrong

### Board won't connect
1. Check Railway logs (look for Supabase errors)
2. Verify env vars match exactly
3. Restart Railway service

### WebSocket shows `ws://` instead of `wss://`
1. Make sure you're on `https://`, not `http://`
2. This is automatic based on browser protocol

### Events missing from PostHog
1. Check if `VITE_POSTHOG_KEY` is set correctly
2. PostHog only initializes on non-localhost
3. Check browser console for JS errors

### QR code not working
1. Verify `NODE_ENV=production` in Railway
2. Check QR image displays
3. Verify phone is on same network or has internet

**For detailed troubleshooting, see `DEPLOYMENT_GUIDE.md`**

---

## Congrats! 🎉

You just shipped **Digital Solari** to production with:
- ✅ Persistent sessions (survive restarts)
- ✅ Error tracking (Sentry)
- ✅ Usage analytics (PostHog)
- ✅ Auto-scaling server (Railway)
- ✅ Free SSL/TLS
- ✅ Custom domain support

Next: monitor your dashboards and iterate based on user feedback!
