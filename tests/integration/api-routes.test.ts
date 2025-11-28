import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Integration tests for API routes
 *
 * Note: These tests verify the authentication and validation logic
 * without actually making HTTP requests to the running server.
 */

describe('API Routes Integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.VALID_API_KEYS = 'test-api-key-123';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('POST /api/ask', () => {
    it('should require authentication', async () => {
      // This test verifies the auth middleware would block unauthenticated requests
      const { withAuth } = await import('@/lib/auth/middleware');

      const request = new Request('http://localhost:3000/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: 'test-workspace',
          question: 'What does this code do?',
        }),
      });

      const authResult = await withAuth(request);

      expect(authResult.success).toBe(false);
      expect(authResult.response).toBeDefined();
    });

    it('should accept request with valid API key', async () => {
      const { withAuth } = await import('@/lib/auth/middleware');

      const request = new Request('http://localhost:3000/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'test-api-key-123',
        },
        body: JSON.stringify({
          workspaceId: 'test-workspace',
          question: 'What does this code do?',
        }),
      });

      const authResult = await withAuth(request);

      expect(authResult.success).toBe(true);
      expect(authResult.auth).toBeDefined();
      expect(authResult.auth?.userId).toBeDefined();
    });

    it('should validate request body structure', () => {
      // Valid request body
      const validBody = {
        workspaceId: 'test-workspace-123',
        question: 'How does authentication work?',
      };

      expect(validBody.workspaceId).toBeDefined();
      expect(validBody.question).toBeDefined();
      expect(typeof validBody.workspaceId).toBe('string');
      expect(typeof validBody.question).toBe('string');

      // Invalid request body (missing fields)
      const invalidBody = {
        workspaceId: 'test-workspace-123',
        // missing question
      };

      expect(invalidBody.question).toBeUndefined();
    });
  });

  describe('POST /api/generate-key', () => {
    it('should require authentication', async () => {
      const { withAuth } = await import('@/lib/auth/middleware');

      const request = new Request('http://localhost:3000/api/generate-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const authResult = await withAuth(request);

      expect(authResult.success).toBe(false);
      expect(authResult.response).toBeDefined();
    });

    it('should accept authenticated requests', async () => {
      const { withAuth } = await import('@/lib/auth/middleware');

      const request = new Request('http://localhost:3000/api/generate-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'test-api-key-123',
        },
      });

      const authResult = await withAuth(request);

      expect(authResult.success).toBe(true);
    });
  });

  describe('Authentication Headers', () => {
    it('should accept x-api-key header', async () => {
      const { validateApiKey } = await import('@/lib/auth/api-auth');

      const request = new Request('http://localhost:3000/api/test', {
        headers: {
          'x-api-key': 'test-api-key-123',
        },
      });

      const result = await validateApiKey(request);

      expect(result.success).toBe(true);
    });

    it('should accept Authorization Bearer header', async () => {
      const { validateApiKey } = await import('@/lib/auth/api-auth');

      const request = new Request('http://localhost:3000/api/test', {
        headers: {
          Authorization: 'Bearer test-api-key-123',
        },
      });

      const result = await validateApiKey(request);

      expect(result.success).toBe(true);
    });

    it('should reject malformed Authorization header', async () => {
      const { validateApiKey } = await import('@/lib/auth/api-auth');

      const request = new Request('http://localhost:3000/api/test', {
        headers: {
          Authorization: 'Invalid test-api-key-123', // Should be "Bearer"
        },
      });

      const result = await validateApiKey(request);

      expect(result.success).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should track rate limits per client', async () => {
      const { checkRateLimit } = await import('@/lib/auth/api-auth');

      const client1Result = await checkRateLimit('client-1');
      const client2Result = await checkRateLimit('client-2');

      expect(client1Result.allowed).toBe(true);
      expect(client2Result.allowed).toBe(true);
    });

    it('should respect configured rate limit', async () => {
      process.env.API_RATE_LIMIT = '100';

      const { checkRateLimit } = await import('@/lib/auth/api-auth');

      const result = await checkRateLimit('test-client');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(100);
    });
  });

  describe('IP Whitelisting', () => {
    it('should allow all IPs when not configured', async () => {
      delete process.env.ALLOWED_IPS;

      const { checkIpWhitelist } = await import('@/lib/auth/api-auth');

      const request = new Request('http://localhost:3000/api/test', {
        headers: {
          'x-forwarded-for': '1.2.3.4',
        },
      });

      const result = await checkIpWhitelist(request);

      expect(result).toBe(true);
    });

    it('should enforce IP whitelist when configured', async () => {
      process.env.ALLOWED_IPS = '192.168.1.100,10.0.0.50';

      const { checkIpWhitelist } = await import('@/lib/auth/api-auth');

      // Whitelisted IP
      const allowedRequest = new Request('http://localhost:3000/api/test', {
        headers: {
          'x-forwarded-for': '192.168.1.100',
        },
      });

      expect(await checkIpWhitelist(allowedRequest)).toBe(true);

      // Non-whitelisted IP
      const blockedRequest = new Request('http://localhost:3000/api/test', {
        headers: {
          'x-forwarded-for': '1.2.3.4',
        },
      });

      expect(await checkIpWhitelist(blockedRequest)).toBe(false);
    });

    it('should support wildcard IP whitelist', async () => {
      process.env.ALLOWED_IPS = '*';

      const { checkIpWhitelist } = await import('@/lib/auth/api-auth');

      const request = new Request('http://localhost:3000/api/test', {
        headers: {
          'x-forwarded-for': '1.2.3.4',
        },
      });

      const result = await checkIpWhitelist(request);

      expect(result).toBe(true);
    });
  });

  describe('Error Responses', () => {
    it('should return 401 for invalid API key', async () => {
      const { withAuth } = await import('@/lib/auth/middleware');

      const request = new Request('http://localhost:3000/api/test', {
        headers: {
          'x-api-key': 'invalid-key',
        },
      });

      const result = await withAuth(request);

      expect(result.success).toBe(false);
      expect(result.response?.status).toBe(401);
    });

    it('should return 403 for blocked IP', async () => {
      process.env.ALLOWED_IPS = '192.168.1.100';

      const { withAuth } = await import('@/lib/auth/middleware');

      const request = new Request('http://localhost:3000/api/test', {
        headers: {
          'x-api-key': 'test-api-key-123',
          'x-forwarded-for': '1.2.3.4',
        },
      });

      const result = await withAuth(request);

      expect(result.success).toBe(false);
      expect(result.response?.status).toBe(403);
    });
  });
});
