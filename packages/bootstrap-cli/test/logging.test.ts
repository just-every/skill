import { describe, expect, it } from 'vitest';
import { redactValue, formatRedactedMap } from '../src/logging.js';

describe('redactValue', () => {
  describe('empty or missing values', () => {
    it('returns "<empty>" for empty string', () => {
      expect(redactValue('ANY_KEY', '')).toBe('<empty>');
    });

    it('returns "<empty>" for null-like value', () => {
      expect(redactValue('ANY_KEY', null as any)).toBe('<empty>');
    });

    it('returns "<empty>" for undefined-like value', () => {
      expect(redactValue('ANY_KEY', undefined as any)).toBe('<empty>');
    });
  });

  describe('non-sensitive keys', () => {
    it('returns value unchanged for non-sensitive keys', () => {
      expect(redactValue('PROJECT_ID', 'my-project-123')).toBe('my-project-123');
      expect(redactValue('DATABASE_URL', 'postgres://localhost')).toBe('postgres://localhost');
      expect(redactValue('PORT', '3000')).toBe('3000');
      expect(redactValue('NODE_ENV', 'production')).toBe('production');
    });
  });

  describe('TOKEN keyword (case-insensitive)', () => {
    it('redacts keys with TOKEN suffix', () => {
      const result = redactValue('API_TOKEN', 'abcd1234567890');
      expect(result).toBe('abcd...90');
      expect(result).not.toContain('1234567');
    });

    it('redacts keys with TOKEN prefix', () => {
      const result = redactValue('TOKEN_VALUE', 'xyz9876543210');
      expect(result).toBe('xyz9...10');
      expect(result).not.toContain('876543');
    });

    it('redacts keys with token in middle', () => {
      const result = redactValue('MY_TOKEN_HERE', 'secret123456');
      expect(result).toBe('secr...56');
      expect(result).not.toContain('et123');
    });

    it('is case-insensitive for TOKEN', () => {
      expect(redactValue('api_token', 'value123')).toBe('valu...23');
      expect(redactValue('API_Token', 'value123')).toBe('valu...23');
      expect(redactValue('Token_API', 'value123')).toBe('valu...23');
    });

    it('redacts real-world token keys', () => {
      const cloudflareToken = redactValue('CLOUDFLARE_API_TOKEN', 'cf_1234567890abcdef');
      expect(cloudflareToken).toBe('cf_1...ef');
      expect(cloudflareToken).not.toContain('234567890abcd');

      const githubToken = redactValue('GITHUB_TOKEN', 'ghp_abcdefghijklmnop');
      expect(githubToken).toBe('ghp_...op');
      expect(githubToken).not.toContain('abcdefghijklmn');
    });
  });

  describe('SECRET keyword (case-insensitive)', () => {
    it('redacts keys with SECRET suffix', () => {
      const result = redactValue('STRIPE_SECRET', 'sk_test_abc123');
      expect(result).toBe('sk_t...23');
      expect(result).not.toContain('est_abc1');
    });

    it('redacts keys with SECRET prefix', () => {
      const result = redactValue('SECRET_API_KEY', 'secret-value-123');
      expect(result).toBe('secr...23');
      expect(result).not.toContain('et-value-1');
    });

    it('redacts keys with secret in middle', () => {
      const result = redactValue('MY_SECRET_VALUE', 'hidden123456');
      expect(result).toBe('hidd...56');
      expect(result).not.toContain('en1234');
    });

    it('is case-insensitive for SECRET', () => {
      expect(redactValue('stripe_secret', 'sk_123')).toBe('sk_1...23');
      expect(redactValue('Secret_Key', 'sk_123')).toBe('sk_1...23');
      expect(redactValue('WEBHOOK_Secret', 'sk_123')).toBe('sk_1...23');
    });

    it('redacts real-world secret keys', () => {
      const stripeSecret = redactValue('STRIPE_SECRET_KEY', 'sk_live_1234567890');
      expect(stripeSecret).toBe('sk_l...90');
      expect(stripeSecret).not.toContain('ive_12345678');

      const webhookSecret = redactValue('STRIPE_WEBHOOK_SECRET', 'whsec_abcdef123456');
      expect(webhookSecret).toBe('whse...56');
      expect(webhookSecret).not.toContain('c_abcdef1234');
    });
  });

  describe('KEY keyword (case-insensitive)', () => {
    it('redacts keys with KEY suffix', () => {
      const result = redactValue('API_KEY', 'key-abc-123-xyz');
      expect(result).toBe('key-...yz');
      expect(result).not.toContain('abc-123-x');
    });

    it('redacts keys with KEY prefix', () => {
      const result = redactValue('KEY_VALUE', 'mykey123456');
      expect(result).toBe('myke...56');
      expect(result).not.toContain('y12345');
    });

    it('redacts keys with key in middle', () => {
      const result = redactValue('SERVICE_KEY_ID', 'id123456789');
      expect(result).toBe('id12...89');
      expect(result).not.toContain('3456');
    });

    it('is case-insensitive for KEY', () => {
      expect(redactValue('api_key', 'value123')).toBe('valu...23');
      expect(redactValue('API_Key', 'value123')).toBe('valu...23');
      expect(redactValue('Key_API', 'value123')).toBe('valu...23');
    });
  });

  describe('PASSWORD keyword (case-insensitive)', () => {
    it('redacts keys with PASSWORD suffix', () => {
      const result = redactValue('DB_PASSWORD', 'super-secret-pass');
      expect(result).toBe('supe...ss');
      expect(result).not.toContain('r-secret-pa');
    });

    it('redacts keys with PASSWORD prefix', () => {
      const result = redactValue('PASSWORD_HASH', 'hashed123456');
      expect(result).toBe('hash...56');
      expect(result).not.toContain('ed1234');
    });

    it('redacts keys with password in middle', () => {
      const result = redactValue('USER_PASSWORD_VALUE', 'pass123456');
      expect(result).toBe('pass...56');
      expect(result).not.toContain('1234');
    });

    it('is case-insensitive for PASSWORD', () => {
      expect(redactValue('db_password', 'value123')).toBe('valu...23');
      expect(redactValue('DB_Password', 'value123')).toBe('valu...23');
      expect(redactValue('Password_DB', 'value123')).toBe('valu...23');
    });

    it('redacts real-world password keys', () => {
      const dbPassword = redactValue('DATABASE_PASSWORD', 'myp@ssw0rd!123');
      expect(dbPassword).toBe('myp@...23');
      expect(dbPassword).not.toContain('ssw0rd!1');
    });
  });

  describe('CLIENT keyword (case-insensitive)', () => {
    it('redacts keys with CLIENT in them', () => {
      const result = redactValue('CLIENT_SECRET', 'client-xyz-123');
      expect(result).toBe('clie...23');
      expect(result).not.toContain('nt-xyz-1');
    });

    it('is case-insensitive for CLIENT', () => {
      expect(redactValue('client_id', 'value123')).toBe('valu...23');
      expect(redactValue('CLIENT_Secret', 'value123')).toBe('valu...23');
    });
  });

  describe('AUTH keyword (case-insensitive)', () => {
    it('redacts keys with AUTH in them', () => {
      const result = redactValue('AUTH_TOKEN', 'auth-bearer-123');
      expect(result).toBe('auth...23');
      expect(result).not.toContain('-bearer-1');
    });

    it('is case-insensitive for AUTH', () => {
      expect(redactValue('auth_key', 'value123')).toBe('valu...23');
      expect(redactValue('AUTH_Key', 'value123')).toBe('valu...23');
      expect(redactValue('BASIC_Auth', 'value123')).toBe('valu...23');
    });

    it('redacts real-world auth keys', () => {
      const basicAuth = redactValue('LOGTO_MANAGEMENT_AUTH_BASIC', 'Basic xyz123abc');
      expect(basicAuth).toBe('Basi...bc');
      expect(basicAuth).not.toContain('c xyz123a');
    });
  });

  describe('short values (4 chars or less)', () => {
    it('redacts 4-char value to first char + ***', () => {
      expect(redactValue('API_TOKEN', 'abcd')).toBe('a***');
    });

    it('redacts 3-char value to first char + ***', () => {
      expect(redactValue('API_SECRET', 'abc')).toBe('a***');
    });

    it('redacts 2-char value to first char + ***', () => {
      expect(redactValue('API_KEY', 'ab')).toBe('a***');
    });

    it('redacts 1-char value to first char + ***', () => {
      expect(redactValue('PASSWORD', 'a')).toBe('a***');
    });
  });

  describe('compound sensitive keys', () => {
    it('redacts keys with multiple sensitive keywords', () => {
      const result1 = redactValue('AUTH_TOKEN_SECRET', 'compound-secret-123');
      expect(result1).toBe('comp...23');
      expect(result1).not.toContain('ound-secret-1');

      const result2 = redactValue('CLIENT_SECRET_KEY', 'multi-key-456');
      expect(result2).toBe('mult...56');
      expect(result2).not.toContain('i-key-45');
    });
  });

  describe('edge cases', () => {
    it('handles values with special characters', () => {
      const result = redactValue('API_TOKEN', 'abc!@#$%^&*()123');
      expect(result).toBe('abc!...23');
      expect(result).not.toContain('@#$%^&*()1');
    });

    it('handles very long values', () => {
      const longValue = 'a'.repeat(100);
      const result = redactValue('SECRET_KEY', longValue);
      expect(result).toBe(`aaaa...aa`);
      expect(result.length).toBeLessThan(longValue.length);
    });

    it('preserves exact format: first 4 chars + ... + last 2 chars', () => {
      const result = redactValue('TOKEN', '12345678');
      expect(result).toBe('1234...78');
      expect(result.length).toBe(9); // 4 + 3 + 2
    });
  });
});

describe('formatRedactedMap', () => {
  it('formats empty array as empty string', () => {
    expect(formatRedactedMap([])).toBe('');
  });

  it('formats single entry with default indent', () => {
    const entries: Array<[string, string]> = [['KEY', 'value']];
    expect(formatRedactedMap(entries)).toBe('  KEY=value');
  });

  it('formats multiple entries with default indent', () => {
    const entries: Array<[string, string]> = [
      ['API_KEY', 'abcd...23'],
      ['SECRET', 'secr...78'],
      ['PROJECT_ID', 'my-project']
    ];
    const result = formatRedactedMap(entries);
    expect(result).toBe('  API_KEY=abcd...23\n  SECRET=secr...78\n  PROJECT_ID=my-project');
  });

  it('uses custom indent', () => {
    const entries: Array<[string, string]> = [
      ['KEY1', 'val1'],
      ['KEY2', 'val2']
    ];
    const result = formatRedactedMap(entries, '    ');
    expect(result).toBe('    KEY1=val1\n    KEY2=val2');
  });

  it('handles entries with redacted values', () => {
    const entries: Array<[string, string]> = [
      ['STRIPE_SECRET_KEY', 'sk_t...23'],
      ['CLOUDFLARE_API_TOKEN', 'cf_1...ef']
    ];
    const result = formatRedactedMap(entries);
    expect(result).toContain('STRIPE_SECRET_KEY=sk_t...23');
    expect(result).toContain('CLOUDFLARE_API_TOKEN=cf_1...ef');
  });

  it('handles entries with <empty> placeholder', () => {
    const entries: Array<[string, string]> = [
      ['OPTIONAL_KEY', '<empty>'],
      ['REQUIRED_KEY', 'value']
    ];
    const result = formatRedactedMap(entries);
    expect(result).toContain('OPTIONAL_KEY=<empty>');
    expect(result).toContain('REQUIRED_KEY=value');
  });
});
