# Veranote Daily Monitor

Use this monitor only for the canonical Veranote production app repo:

```text
/Users/danielhale/.openclaw/workspace/app-prototype
```

Do not use the similarly named Codex scratch checkouts under `Documents/Codex` for production status. Those folders can describe different experiments and will give misleading reports.

## Automation Command

```bash
cd /Users/danielhale/.openclaw/workspace/app-prototype
npm run status:daily
```

The command verifies:

- Canonical repo path and GitHub remote.
- Latest commit and local dirty tracked files.
- Production build.
- Supabase/durable-storage connectivity health.
- Public production smoke check.
- Recent Vercel deployment status.

It writes operational-only reports to `test-results/`:

- `veranote-daily-status-YYYY-MM-DD.json`
- `veranote-daily-status-YYYY-MM-DD.md`

## Optional Durable Browser Check

The browser-backed production durable-storage test is intentionally optional because some local/work networks intercept `app.veranote.org` certificates or return proxy block pages.

To include it:

```bash
cd /Users/danielhale/.openclaw/workspace/app-prototype
VERANOTE_DAILY_STATUS_DURABLE=1 npm run status:daily
```

If `app.veranote.org` fails with a TLS/certificate/proxy/403 block page but `https://veranote-app.vercel.app` is healthy, classify that as likely local network filtering unless independent external checks also fail.
