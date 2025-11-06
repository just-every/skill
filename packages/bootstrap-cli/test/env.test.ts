import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BootstrapEnvError, loadBootstrapEnvironment } from '../src/env.js';

const BASE_OVERRIDES = {
  PROJECT_ID: 'demo-project',
  PROJECT_DOMAIN: 'https://demo.just',
  CLOUDFLARE_ACCOUNT_ID: 'cf-account',
  CLOUDFLARE_API_TOKEN: 'token-value',
  LOGTO_ENDPOINT: 'https://auth.example.com',
  LOGTO_API_RESOURCE: 'https://api.example.com'
};

function withTempEnv(files: Record<string, string>, run: (cwd: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'bootstrap-cli-'));
  try {
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(join(dir, name), contents);
    }
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('loadBootstrapEnvironment', () => {
  it('prefers .env.local values over .env', () => {
    withTempEnv(
      {
        '.env': 'STRIPE_SECRET_KEY=sk_test_env\n',
        '.env.local': 'STRIPE_SECRET_KEY=sk_test_local\n'
      },
      (cwd) => {
        const result = loadBootstrapEnvironment({
          cwd,
          overrides: BASE_OVERRIDES
        });
        expect(result.env.STRIPE_SECRET_KEY).toBe('sk_test_local');
      }
    );
  });

  it('throws a BootstrapEnvError when required variables are missing', () => {
    withTempEnv({}, (cwd) => {
      expect(() =>
        loadBootstrapEnvironment({
          cwd,
          overrides: {
            ...BASE_OVERRIDES,
            STRIPE_SECRET_KEY: undefined
          }
        })
      ).toThrow(BootstrapEnvError);
    });
  });

  it('redacts sensitive values in the report', () => {
    withTempEnv(
      {
        '.env': [
          'STRIPE_SECRET_KEY=sk_test_abc123',
          'STRIPE_WEBHOOK_SECRET=whsec_456789',
          'CLOUDFLARE_API_TOKEN=abcd1234abcd1234'
        ].join('\n')
      },
      (cwd) => {
        const result = loadBootstrapEnvironment({
          cwd,
          overrides: {
            PROJECT_ID: 'demo-project',
            CLOUDFLARE_ACCOUNT_ID: 'cf-account',
            LOGTO_ENDPOINT: 'https://auth.example.com',
            LOGTO_API_RESOURCE: 'https://api.example.com'
          }
        });
        expect(result.report.redacted.STRIPE_SECRET_KEY).toMatch(/^sk_t/);
        expect(result.report.redacted.CLOUDFLARE_API_TOKEN).toContain('...');
      }
    );
  });

  it('redacts TOKEN keyword in CLOUDFLARE_API_TOKEN (schema key)', () => {
    withTempEnv(
      {
        '.env': 'CLOUDFLARE_API_TOKEN=token_secret_value_12345\nSTRIPE_SECRET_KEY=sk_test_123456'.split('\n').join('\n')
      },
      (cwd) => {
        const result = loadBootstrapEnvironment({
          cwd,
          overrides: BASE_OVERRIDES
        });

        // Verify CLOUDFLARE_API_TOKEN (has TOKEN keyword) is redacted (toke...45)
        expect(result.report.redacted.CLOUDFLARE_API_TOKEN).toMatch(/^toke\.\.\./);
        expect(result.report.redacted.CLOUDFLARE_API_TOKEN).not.toContain('n_secret_value_123');
        expect(result.report.summary).not.toContain('token_secret_value_12345');
        expect(result.report.summary).not.toContain('n_secret_value_123');
      }
    );
  });

  it('redacts SECRET keyword variants in schema keys', () => {
    withTempEnv(
      {
        '.env': [
          'STRIPE_SECRET_KEY=sk_live_mysecretvalue123',
          'STRIPE_WEBHOOK_SECRET=whsec_webhook_secret_456',
          'LOGTO_M2M_APP_SECRET=m2m_app_secret_789'
        ].join('\n'),
        '.env.local.generated': 'LOGTO_M2M_APP_SECRET=generated_secret_abc'
      },
      (cwd) => {
        const result = loadBootstrapEnvironment({
          cwd,
          overrides: BASE_OVERRIDES
        });

        // All keys with SECRET keyword should be redacted
        expect(result.report.redacted.STRIPE_SECRET_KEY).toMatch(/^sk_l\.\.\./);
        expect(result.report.redacted.STRIPE_WEBHOOK_SECRET).toMatch(/^whse\.\.\./);
        expect(result.report.redacted.LOGTO_M2M_APP_SECRET).toMatch(/^gene\.\.\./);

        // Ensure no actual secret values leaked
        expect(result.report.summary).not.toContain('mysecretvalue123');
        expect(result.report.summary).not.toContain('webhook_secret_456');
        expect(result.report.summary).not.toContain('app_secret_789');
        expect(result.report.summary).not.toContain('generated_secret_abc');
      }
    );
  });

  it('redacts KEY keyword variants in schema keys', () => {
    withTempEnv(
      {
        '.env': [
          'STRIPE_SECRET_KEY=stripe_key_value_123',
          'STRIPE_TEST_SECRET_KEY=test_key_value_456'
        ].join('\n')
      },
      (cwd) => {
        const result = loadBootstrapEnvironment({
          cwd,
          overrides: BASE_OVERRIDES
        });

        // Both keys with KEY keyword should be redacted
        expect(result.report.redacted.STRIPE_SECRET_KEY).toMatch(/^stri\.\.\./);
        expect(result.report.redacted.STRIPE_TEST_SECRET_KEY).toMatch(/^test\.\.\./);

        // Ensure no actual key values leaked
        expect(result.report.summary).not.toContain('stripe_key_value_123');
        expect(result.report.summary).not.toContain('test_key_value_456');
      }
    );
  });

  it('redacts AUTH keyword in LOGTO_MANAGEMENT_AUTH_BASIC', () => {
    withTempEnv(
      {
        '.env': 'LOGTO_MANAGEMENT_AUTH_BASIC=Basic user:password123\nSTRIPE_SECRET_KEY=sk_test_123'.split('\n').join('\n')
      },
      (cwd) => {
        const result = loadBootstrapEnvironment({
          cwd,
          overrides: BASE_OVERRIDES
        });

        // LOGTO_MANAGEMENT_AUTH_BASIC has AUTH keyword
        expect(result.report.redacted.LOGTO_MANAGEMENT_AUTH_BASIC).toBe('Basi...23');
        expect(result.report.summary).not.toContain('user:password1');
      }
    );
  });

  it('does not leak sensitive values in report summary for multiple schema keys', () => {
    withTempEnv(
      {
        '.env': [
          'STRIPE_SECRET_KEY=sk_live_verysecretvalue123',
          'STRIPE_WEBHOOK_SECRET=whsec_webhook_abc123',
          'LOGTO_MANAGEMENT_AUTH_BASIC=Basic admin:P@ssw0rd!'
        ].join('\n')
      },
      (cwd) => {
        const result = loadBootstrapEnvironment({
          cwd,
          overrides: {
            ...BASE_OVERRIDES,
            CLOUDFLARE_API_TOKEN: 'cf_token_xyz_456789'
          }
        });

        // Verify summary doesn't contain actual secret values
        expect(result.report.summary).not.toContain('verysecretvalue123');
        expect(result.report.summary).not.toContain('cf_token_xyz_456789');
        expect(result.report.summary).not.toContain('whsec_webhook_abc123');
        expect(result.report.summary).not.toContain('admin:P@ssw0rd!');

        // Verify redacted forms are present (pattern: first 4 chars + ... + last 2 chars)
        expect(result.report.redacted.STRIPE_SECRET_KEY).toMatch(/^sk_l\.\.\./);
        expect(result.report.redacted.CLOUDFLARE_API_TOKEN).toMatch(/^cf_t\.\.\./);
        expect(result.report.redacted.STRIPE_WEBHOOK_SECRET).toMatch(/^whse\.\.\./);
        expect(result.report.redacted.LOGTO_MANAGEMENT_AUTH_BASIC).toMatch(/^Basi\.\.\./);
      }
    );
  });

  it('loads generated values from .env.local.generated', () => {
    withTempEnv(
      {
        '.env': 'STRIPE_SECRET_KEY=sk_test_env\n',
        '.env.local.generated': [
          'CLOUDFLARE_D1_ID=db_123',
          'CLOUDFLARE_D1_NAME=demo-d1',
          'STRIPE_WEBHOOK_SECRET=whsec_generated'
        ].join('\n')
      },
      (cwd) => {
        const result = loadBootstrapEnvironment({
          cwd,
          overrides: BASE_OVERRIDES
        });
        expect(result.generated.CLOUDFLARE_D1_ID).toBe('db_123');
        expect(result.generated.STRIPE_WEBHOOK_SECRET).toBe('whsec_generated');
        expect(result.base.CLOUDFLARE_D1_ID).toBeUndefined();
        expect(result.env.CLOUDFLARE_D1_ID).toBe('db_123');
        expect(result.missingGenerated).not.toContain('CLOUDFLARE_D1_ID');
      }
    );
  });
});

describe('Environment variable fallbacks and derivations', () => {
  it('falls back to STRIPE_TEST_SECRET_KEY when STRIPE_SECRET_KEY is missing', () => {
    withTempEnv(
      {
        '.env': 'STRIPE_TEST_SECRET_KEY=sk_test_from_test_key\n'
      },
      (cwd) => {
        const result = loadBootstrapEnvironment({
          cwd,
          overrides: {
            ...BASE_OVERRIDES,
            STRIPE_SECRET_KEY: undefined
          }
        });
        expect(result.env.STRIPE_SECRET_KEY).toBe('sk_test_from_test_key');
        expect(result.env.STRIPE_TEST_SECRET_KEY).toBe('sk_test_from_test_key');
      }
    );
  });

  it('does not override explicit STRIPE_SECRET_KEY with STRIPE_TEST_SECRET_KEY', () => {
    withTempEnv(
      {
        '.env': [
          'STRIPE_SECRET_KEY=sk_live_explicit',
          'STRIPE_TEST_SECRET_KEY=sk_test_fallback'
        ].join('\n')
      },
      (cwd) => {
        const result = loadBootstrapEnvironment({
          cwd,
          overrides: {
            ...BASE_OVERRIDES,
            STRIPE_SECRET_KEY: undefined
          }
        });
        expect(result.env.STRIPE_SECRET_KEY).toBe('sk_live_explicit');
      }
    );
  });

  it('derives LOGTO_API_RESOURCE from PROJECT_DOMAIN when missing', () => {
    withTempEnv({}, (cwd) => {
      const result = loadBootstrapEnvironment({
        cwd,
        overrides: {
          ...BASE_OVERRIDES,
          PROJECT_DOMAIN: 'https://example.com',
          LOGTO_API_RESOURCE: undefined,
          STRIPE_SECRET_KEY: 'sk_test_example'
        }
      });
      expect(result.env.LOGTO_API_RESOURCE).toBe('https://example.com/api');
    });
  });

  it('removes trailing slash from PROJECT_DOMAIN when deriving LOGTO_API_RESOURCE', () => {
    withTempEnv({}, (cwd) => {
      const result = loadBootstrapEnvironment({
        cwd,
        overrides: {
          ...BASE_OVERRIDES,
          PROJECT_DOMAIN: 'https://example.com/',
          LOGTO_API_RESOURCE: undefined,
          STRIPE_SECRET_KEY: 'sk_test_example'
        }
      });
      expect(result.env.LOGTO_API_RESOURCE).toBe('https://example.com/api');
    });
  });

  it('does not override explicit LOGTO_API_RESOURCE', () => {
    withTempEnv({}, (cwd) => {
      const result = loadBootstrapEnvironment({
        cwd,
        overrides: {
          ...BASE_OVERRIDES,
          PROJECT_DOMAIN: 'https://example.com',
          LOGTO_API_RESOURCE: 'https://custom-api.com',
          STRIPE_SECRET_KEY: 'sk_test_example'
        }
      });
      expect(result.env.LOGTO_API_RESOURCE).toBe('https://custom-api.com');
    });
  });

  it('derives APP_URL from PROJECT_DOMAIN with default APP_BASE_URL', () => {
    withTempEnv({}, (cwd) => {
      const result = loadBootstrapEnvironment({
        cwd,
        overrides: {
          ...BASE_OVERRIDES,
          PROJECT_DOMAIN: 'https://example.com',
          APP_URL: undefined,
          APP_BASE_URL: undefined,
          STRIPE_SECRET_KEY: 'sk_test_example'
        }
      });
      expect(result.env.APP_URL).toBe('https://example.com/app');
    });
  });

  it('derives APP_URL from PROJECT_DOMAIN with custom APP_BASE_URL', () => {
    withTempEnv({}, (cwd) => {
      const result = loadBootstrapEnvironment({
        cwd,
        overrides: {
          ...BASE_OVERRIDES,
          PROJECT_DOMAIN: 'https://example.com',
          APP_URL: undefined,
          APP_BASE_URL: '/dashboard',
          STRIPE_SECRET_KEY: 'sk_test_example'
        }
      });
      expect(result.env.APP_URL).toBe('https://example.com/dashboard');
    });
  });

  it('removes trailing slash from PROJECT_DOMAIN when deriving APP_URL', () => {
    withTempEnv({}, (cwd) => {
      const result = loadBootstrapEnvironment({
        cwd,
        overrides: {
          ...BASE_OVERRIDES,
          PROJECT_DOMAIN: 'https://example.com/',
          APP_URL: undefined,
          APP_BASE_URL: '/app',
          STRIPE_SECRET_KEY: 'sk_test_example'
        }
      });
      expect(result.env.APP_URL).toBe('https://example.com/app');
    });
  });

  it('does not override explicit APP_URL', () => {
    withTempEnv({}, (cwd) => {
      const result = loadBootstrapEnvironment({
        cwd,
        overrides: {
          ...BASE_OVERRIDES,
          PROJECT_DOMAIN: 'https://example.com',
          APP_URL: 'https://custom-app.com',
          STRIPE_SECRET_KEY: 'sk_test_example'
        }
      });
      expect(result.env.APP_URL).toBe('https://custom-app.com');
    });
  });

  it('derives WORKER_ORIGIN from PROJECT_DOMAIN when missing', () => {
    withTempEnv({}, (cwd) => {
      const result = loadBootstrapEnvironment({
        cwd,
        overrides: {
          ...BASE_OVERRIDES,
          PROJECT_DOMAIN: 'https://example.com',
          WORKER_ORIGIN: undefined,
          STRIPE_SECRET_KEY: 'sk_test_example'
        }
      });
      expect(result.env.WORKER_ORIGIN).toBe('https://example.com');
    });
  });

  it('removes trailing slash from PROJECT_DOMAIN when deriving WORKER_ORIGIN', () => {
    withTempEnv({}, (cwd) => {
      const result = loadBootstrapEnvironment({
        cwd,
        overrides: {
          ...BASE_OVERRIDES,
          PROJECT_DOMAIN: 'https://example.com/',
          WORKER_ORIGIN: undefined,
          STRIPE_SECRET_KEY: 'sk_test_example'
        }
      });
      expect(result.env.WORKER_ORIGIN).toBe('https://example.com');
    });
  });

  it('does not override explicit WORKER_ORIGIN', () => {
    withTempEnv({}, (cwd) => {
      const result = loadBootstrapEnvironment({
        cwd,
        overrides: {
          ...BASE_OVERRIDES,
          PROJECT_DOMAIN: 'https://example.com',
          WORKER_ORIGIN: 'https://custom-worker.com',
          STRIPE_SECRET_KEY: 'sk_test_example'
        }
      });
      expect(result.env.WORKER_ORIGIN).toBe('https://custom-worker.com');
    });
  });

  it('works with minimal .env using only PROJECT_DOMAIN', () => {
    withTempEnv(
      {
        '.env': [
          'PROJECT_ID=minimal',
          'PROJECT_DOMAIN=https://minimal.example.com',
          'CLOUDFLARE_ACCOUNT_ID=cf123',
          'CLOUDFLARE_API_TOKEN=token123',
          'LOGTO_ENDPOINT=https://auth.example.com',
          'STRIPE_TEST_SECRET_KEY=sk_test_minimal'
        ].join('\n')
      },
      (cwd) => {
        const result = loadBootstrapEnvironment({ cwd });
        expect(result.env.STRIPE_SECRET_KEY).toBe('sk_test_minimal');
        expect(result.env.LOGTO_API_RESOURCE).toBe('https://minimal.example.com/api');
        expect(result.env.APP_URL).toBe('https://minimal.example.com/app');
        expect(result.env.WORKER_ORIGIN).toBe('https://minimal.example.com');
      }
    );
  });
});
