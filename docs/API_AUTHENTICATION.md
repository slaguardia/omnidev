# API Authentication

This document covers authentication methods and security configuration for the API.

For API routes, request/response schemas, and the job queue system, see [API Operations](/docs/api-operations).

## Authentication Methods

The application supports two authentication methods:

1. **Session Authentication** (Dashboard users) - Automatically authenticated via NextAuth session when logged in
2. **API Key Authentication** (External clients) - API keys for programmatic access with optional IP whitelisting and rate limiting

Dashboard users don't need to manage API keys for using the dashboard - they're authenticated via their login session. API keys are only needed for external programmatic access.

## Configuration Methods

### 1. Dashboard (Recommended)

The recommended way to manage API keys is through the web dashboard:

1. Navigate to **Dashboard** → **Account Security** tab
2. Click **Generate API Key** to create a new key
3. Copy the generated key immediately (it won't be shown again)
4. Use this key in your API requests

Dashboard-generated keys are stored securely in `workspaces/api-keys.json` and are automatically validated by the API.
For security, the application stores **only a hash** of dashboard-generated keys (the plaintext key is shown only once when generated).

### 2. Environment Variables (Legacy/Fallback)

For backwards compatibility or CI/CD environments, you can also configure API keys via environment variables in your `.env.local` file:

```bash
# Optional - only needed if not using dashboard-generated keys
ADMIN_API_KEY=your-secure-admin-api-key-here
VALID_API_KEYS=client-key-1,client-key-2,client-key-3

# Rate limiting and IP restrictions
API_RATE_LIMIT=100
ALLOWED_IPS=192.168.1.100,10.0.0.50
```

**Variable descriptions:**

- `ADMIN_API_KEY` - Admin API key (32+ characters recommended)
- `VALID_API_KEYS` - Comma-separated list of client keys
- `API_RATE_LIMIT` - Requests per hour per client
- `ALLOWED_IPS` - IP whitelist (use `*` to allow all, or comma-separated list)

## Authentication Priority

The API validates authentication in the following order:

1. **Session authentication** (NextAuth session for logged-in dashboard users)
2. **Dashboard-generated API keys** (stored in `workspaces/api-keys.json`)
3. **Admin API key** (from `ADMIN_API_KEY` environment variable)
4. **Client API keys** (from `VALID_API_KEYS` environment variable)

## How to Use

### 1. API Key Authentication

External clients must include an API key in their requests using either:

**Option A: x-api-key header**

```bash
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "workspaceId": "workspace-123",
    "question": "How does this code work?"
  }'
```

**Option B: Authorization Bearer token**

```bash
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-here" \
  -d '{
    "workspaceId": "workspace-123",
    "question": "How does this code work?"
  }'
```

### 2. JavaScript/Node.js Example

```javascript
const response = await fetch('http://localhost:3000/api/ask', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'your-api-key-here',
  },
  body: JSON.stringify({
    workspaceId: 'workspace-123',
    question: 'How does this code work?',
  }),
});

const data = await response.json();
console.log(data);
```

### 3. Python Example

```python
import requests

url = 'http://localhost:3000/api/ask'
headers = {
    'Content-Type': 'application/json',
    'x-api-key': 'your-api-key-here'
}
data = {
    'workspaceId': 'workspace-123',
    'question': 'How does this code work?'
}

response = requests.post(url, json=data, headers=headers)
result = response.json()
print(result)
```

## Security Features

1. **API Key Validation**: All requests must include a valid API key
2. **Rate Limiting**: Configurable request limits per client per hour
3. **IP Whitelisting**: Optional IP address restrictions
4. **Request Logging**: All authentication attempts are logged
5. **Key Storage**: Dashboard-generated API keys are stored as hashes (not plaintext)

## Error Responses

| Status | Error                              | Description                             |
| ------ | ---------------------------------- | --------------------------------------- |
| 401    | Invalid API key                    | The provided API key is not valid       |
| 403    | Access denied from this IP address | Client IP is not whitelisted            |
| 429    | Rate limit exceeded                | Client has exceeded their request quota |

## Production Recommendations

1. **Use Strong API Keys**: Generate keys with at least 32 characters
2. **Enable IP Whitelisting**: Restrict access to known IP addresses
3. **Monitor Usage**: Implement proper logging and monitoring
4. **Rate Limiting**: Use Redis or a database for production rate limiting
5. **HTTPS Only**: Always use HTTPS in production
6. **Rotate Keys**: Regularly rotate API keys
7. **Reverse Proxy / Client IP Headers**:
   - If you use `ALLOWED_IPS`, deploy behind a trusted reverse proxy (Traefik/Caddy) that **overwrites** `X-Forwarded-For` / `X-Real-IP`.
   - Ensure the app container/port is not directly internet-accessible (proxy-only network path), otherwise IP allowlisting can be bypassed by spoofing headers.

## Generating API Keys

### Recommended: Use the Dashboard

The easiest way to generate secure API keys is through the dashboard:

1. Go to **Dashboard** → **Account Security**
2. Click **Generate API Key**
3. Copy and store the key securely

The dashboard automatically generates cryptographically secure keys.

### Manual Generation (for environment variables)

If you need to generate keys for environment variable configuration:

**Using Node.js crypto:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Using OpenSSL:**

```bash
openssl rand -hex 32
```

**Using Python:**

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```
