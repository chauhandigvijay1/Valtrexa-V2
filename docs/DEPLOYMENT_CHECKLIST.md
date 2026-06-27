# Production Deployment Checklist

## Pre-Deployment

### GitHub
- [ ] Push latest code to `main` branch
- [ ] Verify CI passes (build, tsc, lint, test)
- [ ] Tag release: `git tag v1.0.0 && git push origin v1.0.0`
- [ ] Create GitHub Release with changelog

### Environment Variables
- [ ] Copy `.env.example` to Vercel environment
- [ ] Set all **Required** variables
- [ ] Verify `COOKIE_ENCRYPTION_KEY` is set (required for cookie encryption)
- [ ] Verify `PUBLIC_URL` matches the Vercel deployment URL
- [ ] Verify `FRONTEND_URL` matches the frontend domain
- [ ] Set `TELEGRAM_WEBHOOK_SECRET` (random 32-char string)

### Vercel
- [ ] Connect GitHub repository
- [ ] Configure Build: `npm.cmd run build`
- [ ] Configure Output: `dist/`
- [ ] Set Node.js version: 20.x
- [ ] Add all environment variables
- [ ] Deploy to preview branch first
- [ ] Verify preview deployment health check

### Supabase
- [ ] Run all migrations in order (supabase/migrations/)
- [ ] Verify RLS policies on all tables
- [ ] Enable `pgcrypto` extension
- [ ] Run verification SQL:
```sql
SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'provider_cookies');
SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'workflow_state');
SELECT conname FROM pg_constraint WHERE conrelid = 'applications'::regclass AND conname = 'applications_user_job_unique';
```

### Telegram
- [ ] Deploy first, then register webhook:
```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://valtrexa-v2.vercel.app/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```
- [ ] Verify webhook: `curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"`
- [ ] Send `/start` to bot, verify response

### Google OAuth
- [ ] Add `https://valtrexa-v2.vercel.app/api/auth/gmail/callback` to Google Cloud Console redirect URIs
- [ ] Verify `GMAIL_REDIRECT_URI` is set correctly
- [ ] Test OAuth flow end-to-end

### OpenRouter
- [ ] Verify API key has sufficient credits
- [ ] Test AI provider chain: `curl -X POST https://valtrexa-v2.vercel.app/api/health`

### Cron Job (Required for Automation)
- [ ] Add Vercel Cron Job in `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/workflow/cycle",
    "schedule": "*/30 * * * *"
  }]
}
```
- [ ] OR configure external cron (cron-job.org, GitHub Actions) hitting `POST https://valtrexa-v2.vercel.app/api/workflow/cycle`

### Redis (Optional)
- [ ] Set up Upstash Redis (free tier sufficient)
- [ ] Or skip — queue falls back to inline execution

## Post-Deployment Verification

### Health Check
```bash
curl https://valtrexa-v2.vercel.app/api/health
# Expected: {"status":"ok","checks":{"database":{"ok":true},"redis":{"ok":true}}}
```

### Auth Flow
- [ ] Open frontend URL in browser
- [ ] Sign up / Sign in with Google
- [ ] Complete onboarding

### Resume Upload
- [ ] Upload a PDF resume
- [ ] Wait for parsing (check network tab for `/api/resume/parse`)
- [ ] Verify candidate brain sync

### Cookie Management
- [ ] Navigate to `/cookies`
- [ ] Paste a provider cookie (LinkedIn)
- [ ] Verify real HTTP validation
- [ ] Confirm status shows "valid"

### Workflow Precheck
```bash
curl -H "Authorization: Bearer <valid-jwt>" https://valtrexa-v2.vercel.app/api/precheck/workflow
# Expected: {"passed":true/false,"checks":[...]}
```

### Telegram
- [ ] Send `/status` to bot — verify response
- [ ] Send `/refresh_cookies linkedin` — verify response

### Admin Dashboard
- [ ] Log in as admin user
- [ ] Navigate to `/admin`
- [ ] Verify user inspection works

## Rollback Procedure

### If deployment fails:
1. Revert to previous Vercel deployment from dashboard
2. If DB migration failed:
   ```sql
   -- Revert last migration
   DROP TABLE IF EXISTS public.provider_cookies CASCADE;
   ```
3. Re-deploy previous working version

### If data corruption:
1. Restore from Supabase point-in-time backup
2. Reset all provider cookies (users must re-paste)
3. Verify data integrity

## Backup Procedure
- Supabase automatic daily backups (enable in project settings)
- Export schema weekly: `npx supabase db dump -f backup_$(date +%Y%m%d).sql`
- Keep last 4 weeks of backups

## Final Verification Checklist

- [ ] Build passes
- [ ] TypeScript 0 errors
- [ ] 70/70 tests pass
- [ ] Lint 0 errors
- [ ] Health endpoint returns OK
- [ ] Auth works (login/signup)
- [ ] Resume upload + parse works
- [ ] Cookie paste + validate works
- [ ] Workflow precheck returns correct status
- [ ] Telegram webhook responds
- [ ] Admin dashboard loads
- [ ] All env vars configured (not missing any required)
- [ ] Cron job active
- [ ] Rollback procedure documented
- [ ] Backup procedure configured
