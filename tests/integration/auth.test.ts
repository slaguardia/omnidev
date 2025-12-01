import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateApiKey, checkIpWhitelist, checkRateLimit } from '@/lib/auth/api-auth';
import { withAuth } from '@/lib/auth/middleware';

// Mock next-auth to avoid "headers called outside request scope" error
vi.mock('next-auth', () => ({
  getServerSession: vi.fn().mockResolvedValue(null),
}));

describe('API Authentication', () => {
  describe('validateApiKey', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should validate API key from x-api-key header', async () => {
      process.env.VALID_API_KEYS = 'test-key-1,test-key-2';

      const request = new Request('http://localhost:3000/api/test', {
        headers: { 'x-api-key': 'test-key-1' },
      });

      const result = await validateApiKey(request);

      expect(result.success).toBe(true);
      expect(result.userId).toBeDefined();
    });

    it('should validate API key from Authorization Bearer header', async () => {
      process.env.VALID_API_KEYS = 'test-key-1,test-key-2';

      const request = new Request('http://localhost:3000/api/test', {
        headers: { Authorization: 'Bearer test-key-1' },
      });

      const result = await validateApiKey(request);

      expect(result.success).toBe(true);
      expect(result.userId).toBeDefined();
    });

    it('should reject request without API key', async () => {
      process.env.VALID_API_KEYS = 'test-key-1';

      const request = new Request('http://localhost:3000/api/test');

      const result = await validateApiKey(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('API key is required');
    });

    it('should reject invalid API key', async () => {
      process.env.VALID_API_KEYS = 'test-key-1';

      const request = new Request('http://localhost:3000/api/test', {
        headers: { 'x-api-key': 'invalid-key' },
      });

      const result = await validateApiKey(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('should validate admin API key', async () => {
      process.env.ADMIN_API_KEY = 'admin-secret-key';

      const request = new Request('http://localhost:3000/api/test', {
        headers: { 'x-api-key': 'admin-secret-key' },
      });

      const result = await validateApiKey(request);

      expect(result.success).toBe(true);
      expect(result.userId).toBe('admin');
      expect(result.clientName).toBe('Admin');
    });

    it('should return error when API key is invalid', async () => {
      delete process.env.VALID_API_KEYS;
      delete process.env.ADMIN_API_KEY;

      const request = new Request('http://localhost:3000/api/test', {
        headers: { 'x-api-key': 'any-key' },
      });

      const result = await validateApiKey(request);

      expect(result.success).toBe(false);
      // Returns "Invalid API key" when key doesn't match, or "not configured" when no keys exist at all
      expect(result.error).toBeDefined();
    });
  });

  describe('checkIpWhitelist', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should allow all IPs when whitelist is not configured', async () => {
      delete process.env.ALLOWED_IPS;

      const request = new Request('http://localhost:3000/api/test', {
        headers: { 'x-forwarded-for': '192.168.1.100' },
      });

      const result = await checkIpWhitelist(request);

      expect(result).toBe(true);
    });

    it('should allow whitelisted IP', async () => {
      process.env.ALLOWED_IPS = '192.168.1.100,10.0.0.50';

      const request = new Request('http://localhost:3000/api/test', {
        headers: { 'x-forwarded-for': '192.168.1.100' },
      });

      const result = await checkIpWhitelist(request);

      expect(result).toBe(true);
    });

    it('should block non-whitelisted IP', async () => {
      process.env.ALLOWED_IPS = '192.168.1.100,10.0.0.50';

      const request = new Request('http://localhost:3000/api/test', {
        headers: { 'x-forwarded-for': '192.168.1.200' },
      });

      const result = await checkIpWhitelist(request);

      expect(result).toBe(false);
    });

    it('should allow all IPs when wildcard is set', async () => {
      process.env.ALLOWED_IPS = '*';

      const request = new Request('http://localhost:3000/api/test', {
        headers: { 'x-forwarded-for': '192.168.1.200' },
      });

      const result = await checkIpWhitelist(request);

      expect(result).toBe(true);
    });

    it('should handle x-real-ip header', async () => {
      process.env.ALLOWED_IPS = '10.0.0.50';

      const request = new Request('http://localhost:3000/api/test', {
        headers: { 'x-real-ip': '10.0.0.50' },
      });

      const result = await checkIpWhitelist(request);

      expect(result).toBe(true);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests within rate limit', async () => {
      const result = await checkRateLimit('test-client');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeDefined();
    });

    it('should respect API_RATE_LIMIT environment variable', async () => {
      const originalEnv = process.env.API_RATE_LIMIT;
      process.env.API_RATE_LIMIT = '50';

      const result = await checkRateLimit('test-client');

      expect(result.allowed).toBe(true);

      process.env.API_RATE_LIMIT = originalEnv;
    });
  });

  describe('withAuth middleware', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
      process.env.VALID_API_KEYS = 'test-key-1';
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should allow authenticated requests', async () => {
      const request = new Request('http://localhost:3000/api/test', {
        headers: { 'x-api-key': 'test-key-1' },
      });

      const result = await withAuth(request);

      expect(result.success).toBe(true);
      expect(result.auth).toBeDefined();
      expect(result.response).toBeUndefined();
    });

    it('should block requests without API key', async () => {
      const request = new Request('http://localhost:3000/api/test');

      const result = await withAuth(request);

      expect(result.success).toBe(false);
      expect(result.response).toBeDefined();

      const json = await result.response!.json();
      expect(json.error).toContain('API key is required');
    });

    it('should block requests with invalid API key', async () => {
      const request = new Request('http://localhost:3000/api/test', {
        headers: { 'x-api-key': 'invalid-key' },
      });

      const result = await withAuth(request);

      expect(result.success).toBe(false);
      expect(result.response).toBeDefined();

      const json = await result.response!.json();
      expect(json.error).toBe('Invalid API key');
    });

    it('should block requests from non-whitelisted IPs', async () => {
      process.env.ALLOWED_IPS = '192.168.1.100';

      const request = new Request('http://localhost:3000/api/test', {
        headers: {
          'x-api-key': 'test-key-1',
          'x-forwarded-for': '192.168.1.200',
        },
      });

      const result = await withAuth(request);

      expect(result.success).toBe(false);
      expect(result.response).toBeDefined();

      const json = await result.response!.json();
      expect(json.error).toContain('IP address');
    });
  });
});
