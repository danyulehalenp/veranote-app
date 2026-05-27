# Veranote Access and Deployment Guide

This document is safe to keep in the repository. It explains what services Veranote uses, what each one controls, and where credentials should be stored. Do not paste API keys, passwords, tokens, recovery codes, or PHI into this file.

## Current Public URLs

- Production app: https://app.veranote.org
- Vercel fallback app: https://veranote-app.vercel.app
- GitHub repo: https://github.com/danyulehalenp/veranote-app

## Service Map

| Service | Purpose | Account / owner | Secret storage recommendation | Notes |
| --- | --- | --- | --- | --- |
| GitHub | Source code, repo history, Git push access | `danyulehalenp` | Apple Passwords, 1Password, or GitHub CLI keychain | GitHub CLI is preferred over manually pasted PATs. |
| Vercel | Production deployment and domains | Vercel team `veranote`, user `daniel-5864` | Vercel dashboard env vars; Vercel CLI auth in keychain | Project is linked locally as `veranote-app`. |
| Supabase | Database, auth/storage if configured | Veranote Supabase org/project | Supabase dashboard; local `.env.local` only for development | Confirm billing remains active. |
| Squarespace | Domain registrar/DNS for `veranote.org` | Daniel / Veranote domain account | Apple Passwords or 1Password | DNS includes `app.veranote.org` CNAME to Vercel. |
| Local Mac keychain | CLI auth tokens and browser sessions | Daniel's Mac | macOS Keychain / Apple Passwords | Do not export tokens unless rotating them. |

## GitHub

Use GitHub CLI whenever possible:

```bash
gh auth status
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
git push
```

Current intended GitHub identity:

- Username: `danyulehalenp`
- Repo: `danyulehalenp/veranote-app`
- Required scope for repo push: `repo`

Token guidance:

- Prefer GitHub CLI auth over a personal access token pasted into Terminal.
- If a PAT is needed, create a fine-grained token scoped only to `danyulehalenp/veranote-app`.
- Store token details in a password manager entry named `GitHub - Veranote app token`.
- Track expiration date, scope, and repo access in the local secure inventory, not in Git.

## Vercel

Useful commands:

```bash
vercel whoami
vercel ls veranote-app
npm run production:smoke
```

Current local link:

- Project name: `veranote-app`
- Vercel user shown locally: `daniel-5864`
- Production domain: `app.veranote.org`

Deployment behavior:

- Pushing to GitHub `main` can trigger a Vercel production deployment if the GitHub integration remains connected.
- After a push, verify with `vercel ls veranote-app` and `npm run production:smoke`.

Vercel environment variables:

- Store production secrets only in Vercel Environment Variables.
- Use `.env.local` only for local development.
- Never commit `.env.local`.

## Supabase

Use Supabase for project data only through configured app credentials and environment variables.

Recommended inventory items:

- Supabase organization name
- Project name and reference ID
- Project URL
- Anon/public key location
- Service-role key location
- Database password location
- Billing status and payment method owner

Do not place Supabase service-role keys in repo docs. Store them in Supabase/Vercel env vars and a password manager.

## Squarespace / Domain

Veranote domain:

- Root domain: `veranote.org`
- App subdomain: `app.veranote.org`
- DNS manager: Squarespace

Recommended DNS record for app subdomain:

| Type | Name | Target |
| --- | --- | --- |
| CNAME | `app` | Vercel-provided CNAME target |

Do not remove Google Workspace records unless intentionally changing email.

## Local Secure Inventory

The local-only working inventory is stored outside the repository:

```text
/Users/danielhale/.openclaw/secure/veranote-access-inventory/veranote-access-inventory.md
```

That file is for Daniel's operational notes and references to password-manager entries. It should not be committed, pasted into chat, or shared.

## Rotation Checklist

When a token expires or is rotated:

1. Confirm which service the token belongs to.
2. Confirm whether the token is still needed.
3. Create or regenerate the token with minimum required scope.
4. Store the new token in Apple Passwords, 1Password, or the relevant service dashboard.
5. Update only the inventory metadata: expiration date, scope, and storage location.
6. Re-run the relevant check:
   - GitHub: `gh auth status` and `git push --dry-run`
   - Vercel: `vercel whoami` and `vercel ls veranote-app`
   - Production: `npm run production:smoke`

## Never Store Here

- Raw GitHub tokens
- Vercel tokens
- Supabase service-role keys
- Database passwords
- Auth secrets
- OAuth client secrets
- Recovery codes
- PHI or patient examples
