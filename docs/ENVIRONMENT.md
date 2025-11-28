# Environment Variables Reference

This document provides detailed information about all environment variables used in the GitLab Claude Manager application.

## Quick Start

1. **Copy the example file:**

   ```bash
   cp docs/.env.example .env
   ```

2. **Configure required variables:**

   - `NEXTAUTH_SECRET` - Generate with `openssl rand -base64 32`
   - `NEXTAUTH_URL` - Your application URL

3. **Start the application:**
   ```bash
   pnpm dev
   ```

## Environment Variables

### Required Variables

#### NEXTAUTH_SECRET

- **Required:** Yes
- **Description:** Secret key for NextAuth.js JWT token signing and encryption
- **Format:** String (minimum 32 characters recommended)
- **Generate:** `openssl rand -base64 32`
- **Example:** `jFQOQfMxoJmilm9tKJUzzL1lMnihAaAl4jcoTgBkH9k=`

#### NEXTAUTH_URL

- **Required:** Yes
- **Description:** The canonical URL of your application
- **Format:** Full URL with protocol
- **Development:** `http://localhost:3000`
- **Production:** `https://your-domain.com`

---

### Optional Variables (Recommended for Production)

#### VALID_API_KEYS

- **Required:** No
- **Description:** Comma-separated list of valid API keys for external clients
- **Format:** `key1,key2,key3`
- **Generate:** `openssl rand -hex 32` (for each key)
- **Example:** `abc123def456,xyz789ghi012`
- **Note:** If not set, API authentication will be disabled

#### ADMIN_API_KEY

- **Required:** No
- **Description:** Admin API key with elevated privileges
- **Format:** String (32+ characters recommended)
- **Generate:** `openssl rand -hex 32`
- **Security:** Keep separate from VALID_API_KEYS and highly secure

---

### Rate Limiting & Security

#### API_RATE_LIMIT

- **Required:** No
- **Description:** Maximum API requests per hour per client
- **Format:** Integer
- **Default:** `100`
- **Example:** `200`

#### ALLOWED_IPS

- **Required:** No
- **Description:** IP whitelist for API access
- **Format:** Comma-separated IPs or `*` for all
- **Default:** Allow all (if not set)
- **Examples:**
  - `192.168.1.100,10.0.0.50` - Specific IPs
  - `*` - Allow all
  - Empty - Allow all

---

### Claude Code Integration

#### ANTHROPIC_API_KEY

- **Required:** No (can be set via UI)
- **Description:** API key for Claude Code integration
- **Format:** String
- **Get Key:** https://console.anthropic.com/
- **Note:** Can also be configured through the web UI

---

### GitLab Integration

#### GITLAB_TOKEN

- **Required:** No (can be set via UI)
- **Description:** GitLab personal access token
- **Format:** String (starts with `glpat-`)
- **Scopes Required:** `api`, `read_repository`, `write_repository`
- **Create:** https://gitlab.com/-/profile/personal_access_tokens
- **Note:** Can also be configured through the web UI

#### GITLAB_URL

- **Required:** No
- **Description:** GitLab instance URL
- **Default:** `https://gitlab.com`
- **Example:** `https://gitlab.company.com` (for self-hosted)

#### ALLOWED_GITLAB_HOSTS

- **Required:** No
- **Description:** Allowed GitLab hosts for security
- **Format:** Comma-separated hostnames
- **Default:** `gitlab.com`
- **Example:** `gitlab.com,gitlab.company.com`

---

### Application Configuration

#### NODE_ENV

- **Required:** No (automatically set)
- **Description:** Node environment
- **Values:** `development` | `production` | `test`
- **Note:** Set automatically by Next.js and npm scripts

#### NEXT_TELEMETRY_DISABLED

- **Required:** No
- **Description:** Disable Next.js telemetry
- **Values:** `1` (disabled) or `0` (enabled)
- **Default:** `0`
- **Note:** Automatically set to `1` in CI/CD

#### LOG_LEVEL

- **Required:** No
- **Description:** Application logging level
- **Values:** `debug` | `info` | `warn` | `error`
- **Default:** `info`

---

### Workspace Configuration (Advanced)

#### MAX_WORKSPACE_SIZE_MB

- **Required:** No
- **Description:** Maximum workspace size in megabytes
- **Format:** Integer
- **Default:** `500`

#### MAX_CONCURRENT_WORKSPACES

- **Required:** No
- **Description:** Maximum concurrent workspaces
- **Format:** Integer
- **Default:** `3`

#### TEMP_DIR_PREFIX

- **Required:** No
- **Description:** Prefix for temporary workspace directories
- **Format:** String
- **Default:** `gitlab-claude-`

---

## Configuration Methods

The GitLab Claude Manager supports multiple configuration methods:

### 1. Environment Variables (Recommended for Development)

In your `.env` file:

```bash
NEXTAUTH_SECRET=your-secret
GITLAB_TOKEN=your-token
```

### 2. UI Configuration (Recommended for Production)

- Navigate to Dashboard → Settings
- Enter your credentials in the web interface
- Settings are stored securely in the workspace

### 3. CI/CD Variables (For GitLab CI/CD)

- Set variables in GitLab: Settings → CI/CD → Variables
- Variables are automatically available in pipelines
- Mark sensitive variables as "Masked" and "Protected"

---

## Security Best Practices

1. **Never commit `.env` files**

   - The `.env` file is in `.gitignore`
   - Use `docs/.env.example` as a template

2. **Use strong secrets**

   - Minimum 32 characters for all secrets
   - Use cryptographically random generation

3. **Rotate credentials regularly**

   - Change API keys every 90 days
   - Immediately rotate if compromised

4. **Separate environments**

   - Use different secrets for dev/staging/prod
   - Never use production secrets in development

5. **Limit API access**

   - Enable IP whitelisting in production
   - Set appropriate rate limits
   - Use minimal API key permissions

6. **Secure storage**
   - Use environment variables or secure vaults
   - Don't hardcode secrets in code
   - Use CI/CD secret management

---

## Generating Secure Keys

### Using OpenSSL (Recommended)

For NEXTAUTH_SECRET:

```bash
openssl rand -base64 32
```

For API keys:

```bash
openssl rand -hex 32
```

### Using Node.js

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Using Python

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

## Troubleshooting

### Missing NEXTAUTH_SECRET

**Error:** `NEXTAUTH_SECRET is required but not set`

**Solution:**

Generate a secret:

```bash
openssl rand -base64 32
```

Add to .env:

```bash
echo "NEXTAUTH_SECRET=<generated-secret>" >> .env
```

### API Authentication Fails

**Error:** `Invalid API key` or `Authentication service not configured`

**Solutions:**

1. Ensure `VALID_API_KEYS` or `ADMIN_API_KEY` is set
2. Verify API key format (no spaces, correct delimiter)
3. Check that the key matches exactly (case-sensitive)

### IP Blocked

**Error:** `Access denied from this IP address`

**Solutions:**

1. Add your IP to `ALLOWED_IPS`
2. Use `ALLOWED_IPS=*` to allow all (development only)
3. Check `x-forwarded-for` header if behind proxy

---

## Environment Variable Priority

The application checks for configuration in this order:

1. **Runtime configuration** (set via UI)
2. **Environment variables** (.env file or system)
3. **Default values** (hardcoded fallbacks)

---

## Related Documentation

- [API Authentication](/docs/api-authentication) - Detailed auth setup
- [Docker Configuration](/docs/docker) - Docker environment variables
- [Quick Start Guide](/docs/quickstart) - Getting started
- [Credentials Management](/docs/credentials) - Managing tokens and keys
