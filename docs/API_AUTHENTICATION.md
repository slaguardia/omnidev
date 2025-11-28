# API Authentication Setup

This document explains how to set up simple API key authentication for your API routes to secure them from external requests.

## Authentication Method

**API Key Authentication** - Simple and secure authentication using API keys with optional IP whitelisting and rate limiting.

## Environment Variables

Add these variables to your `.env.local` file:

```bash
ADMIN_API_KEY=your-secure-admin-api-key-here
VALID_API_KEYS=client-key-1,client-key-2,client-key-3
API_RATE_LIMIT=100
ALLOWED_IPS=192.168.1.100,10.0.0.50
```

**Variable descriptions:**

- `ADMIN_API_KEY` - Generate secure API keys (32+ characters recommended)
- `VALID_API_KEYS` - Comma-separated list of client keys
- `API_RATE_LIMIT` - Requests per hour per client
- `ALLOWED_IPS` - IP whitelist (use `*` to allow all, or comma-separated list)

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

## Generating Secure API Keys

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
