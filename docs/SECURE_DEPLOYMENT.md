# Secure Internet Deployment

## Purpose

This guide describes how to deploy Omnidev on the public internet with a **defense-in-depth** posture: TLS, trusted network paths, strong authentication, secret handling, and operational habits. It complements [Environment Setup](./ENVIRONMENT.md), [Docker Setup](./DOCKER.md), [API Authentication](./API_AUTHENTICATION.md), and [Credentials Management](./CREDENTIALS.md).

## Cursor SDK Dependency

Omnidev depends on the [`@cursor/sdk`](https://www.npmjs.com/package/@cursor/sdk) package and a valid Cursor API key. Users bring their own Cursor plan; the SDK is a product of Anysphere Inc. and is not affiliated with this project. See [docs/CURSOR.md](./CURSOR.md) for auth + operational details.

## Threat Model (Plain Language)

Omnidev is a **single-user control plane** that can clone repositories, run an agent, push branches, and expose APIs. If an attacker gains dashboard or API access, they can trigger work against configured remotes and data on disk (`data/`, workspaces). The goal of secure deployment is to:

- Prevent unauthorized access to the UI and APIs.
- Keep transport encrypted (TLS).
- Ensure forwarded client IP headers are **not** spoofed when using IP allowlists.
- Protect tokens (GitHub, GitLab, API keys, session secrets) at rest and in backups.

## Architecture Decisions

| Approach                                                | Security                                            | Tradeoff                                                   |
| ------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| **Public HTTPS + strong auth + optional `ALLOWED_IPS`** | Good for remote access from known locations         | Requires a correctly configured reverse proxy for IP trust |
| **Private network / VPN / Tailscale only**              | Strongest reduction of attack surface               | No direct public URL; more setup                           |
| **Edge firewall / WAF / Cloudflare**                    | Absorbs bots and credential stuffing before the app | Extra service and configuration                            |

The application does not replace a firewall or WAF; combine layers.

---

## 1. Transport: TLS Only

- Terminate **HTTPS** at a reverse proxy (Caddy, Traefik, nginx, cloud load balancer) or platform proxy (Coolify, Fly, Railway).
- Set `NEXTAUTH_URL` to the **canonical public URL** (scheme `https`, no trailing slash, no `:3000` in production).
- Do not expose the Node listener on plain HTTP to the open internet for real use.

See [Docker Setup](./DOCKER.md) for production Compose and health checks (`GET /api/health`).

---

## 2. Secrets and First Login

### Required secrets

| Variable               | Role                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXTAUTH_SECRET`      | Session encryption/signing. Generate with `openssl rand -base64 32`.                                                                              |
| `NEXTAUTH_URL`         | Public base URL; must match the URL users type in the browser.                                                                                    |
| `INITIAL_SIGNUP_TOKEN` | **Strongly recommended in production.** Prevents arbitrary first-user signup if the signup UI is reachable. Generate with `openssl rand -hex 32`. |

### Data directory

Persisted data includes SQLite (`data/ralph.db`), API key hashes (`data/api-keys.json`), and user credentials. Treat the **volume or host directory** like a secrets store:

- Restrict filesystem permissions to the service user.
- Include `data/` in **encrypted backups**; treat backups as sensitive.
- Do not commit `data/` or `.env` to git (use `pnpm run check:secrets` in CI where applicable).

---

## 3. Authentication Hardening

1. **Enable two-factor authentication (2FA)** for the dashboard account after first login.
2. **Prefer dashboard-generated API keys** (stored hashed in `data/api-keys.json`) over long-lived keys only in environment variables.
3. **Rotate** API keys and Git tokens when people or laptops leave the team (single-user setups: rotate on compromise or yearly).

Session-based dashboard traffic is authenticated via NextAuth; API clients use `X-API-Key` or `Authorization: Bearer` as described in [API Authentication](./API_AUTHENTICATION.md).

---

## 4. IP Allowlisting (`ALLOWED_IPS`)

The app enforces an optional IP allowlist **before** session/API-key checks. Client IP is taken from `X-Forwarded-For` (first hop) or `X-Real-IP`.

**Rules:**

1. **Only enable `ALLOWED_IPS` behind a trusted reverse proxy** that **sets or overwrites** these headers from the **TCP connection**, not from the client request.
2. Use a **comma-separated list of literal IPs** (e.g. `203.0.113.10,198.51.100.2`). The value `*` allows all IPs (not recommended for public exposure without other controls).
3. **Do not** publish the app container port directly to `0.0.0.0` if relying on IP rules; keep the app on an internal Docker network and expose only the proxy.

Example Caddy snippet (conceptual; adapt to your install):

```caddyfile
reverse_proxy app:3000 {
  header_up X-Forwarded-For {remote_host}
  header_up X-Real-IP {remote_host}
}
```

See [Environment Setup](./ENVIRONMENT.md) for Traefik notes (`trustedIPs` / forwarded headers).

---

## 5. Rate Limiting (`API_RATE_LIMIT`)

- Default is **100 requests per hour per API-key identity** (in-memory, per server process).
- **Dashboard sessions** authenticated via cookie are **not** subject to this same in-app counter; rely on **proxy rate limits**, **WAF**, or **VPN** for abusive browser traffic.
- **Multiple app instances** do not share in-memory counters; use edge rate limiting or a shared store if strict global limits are required.

---

## 6. Worker and Execution

- Run the **worker** (`pnpm worker` or the `worker` service in Compose) with the **same** trusted `data/` and workspace volumes as the app so jobs see the same state.
- The worker does not open inbound HTTP; ensure only the Next.js app is reachable from the network you expose.
- Agent and git credentials live in configured paths/volumes; lock down host access to those volumes.

Sandbox and PATH behavior for containerized runs are described in [Sandbox Architecture](./SANDBOX_ARCHITECTURE.md).

---

## 7. Endpoints Without `withAuth`

A small set of routes are intentionally public or UI-oriented, for example:

- `GET /api/health` — liveness for load balancers (no secrets).
- `GET /api/config/validate` — configuration status (may reveal missing integration tokens; still useful behind TLS for the dashboard).

**Do not** rely on obscurity for these; keep TLS and network controls in place.

---

## 8. Dependency and Supply Chain

- Run **`pnpm audit`** regularly and after upgrades. Address **critical** and **high** issues in direct dependencies first; document accepted risk for dev-only transitive issues.
- Keep **Next.js**, **simple-git**, and **next-auth** on **patched** versions per advisory output.
- CI can run `pnpm test` and `pnpm audit` (allow non-zero exit when triaging).

---

## 9. Security Verification Commands

Run from the repository root after dependency changes:

```bash
# Full test suite (includes auth and API integration tests)
pnpm test

# Focused authentication and API middleware tests
pnpm run security:integration

# npm advisory database (may exit non-zero when vulnerabilities exist)
pnpm run security:audit
```

Optional broader quality gate (types, lint, formatting):

```bash
pnpm lint:all
```

Optional secret scan before commit:

```bash
pnpm run check:secrets
```

---

## 10. Production Checklist

Use this before pointing a domain at a new deployment:

- [ ] HTTPS with valid certificates; `NEXTAUTH_URL` matches the live URL.
- [ ] `NEXTAUTH_SECRET` is unique and long; not reused from another app.
- [ ] `INITIAL_SIGNUP_TOKEN` set; first account created only with the token if that flow is enabled.
- [ ] 2FA enabled for the dashboard user.
- [ ] Reverse proxy overwrites `X-Forwarded-For` / `X-Real-IP` if using `ALLOWED_IPS`.
- [ ] App not bound to the public internet except through the proxy (internal Docker network or localhost + proxy).
- [ ] `API_RATE_LIMIT` set appropriately; edge limits considered for login routes.
- [ ] GitHub/GitLab tokens scoped to minimum required permissions; stored via UI or env, not in chat logs.
- [ ] Backups of `data/` and workspace policy documented.
- [ ] `pnpm audit` reviewed; critical/high items triaged or upgraded.

---

## 11. Related Documentation

| Document                                             | Topic                           |
| ---------------------------------------------------- | ------------------------------- |
| [ENVIRONMENT.md](./ENVIRONMENT.md)                   | All environment variables       |
| [DOCKER.md](./DOCKER.md)                             | Compose, Coolify, ports, health |
| [API_AUTHENTICATION.md](./API_AUTHENTICATION.md)     | API keys, sessions, errors      |
| [CREDENTIALS.md](./CREDENTIALS.md)                   | Token storage practices         |
| [SANDBOX_ARCHITECTURE.md](./SANDBOX_ARCHITECTURE.md) | Container execution boundaries  |

## Non-Goals

This guide does not replace a professional penetration test, formal compliance program, or managed SOC. It focuses on self-hosted deployment hygiene for Omnidev.
