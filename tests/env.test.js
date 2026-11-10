const { loadEnv, resetEnvCache } = require('../config/env');

function withEnv(patch, run) {
  const previous = {};
  Object.keys(patch).forEach((key) => {
    previous[key] = process.env[key];
    if (patch[key] == null) delete process.env[key];
    else process.env[key] = patch[key];
  });
  resetEnvCache();
  try {
    return run();
  } finally {
    Object.keys(patch).forEach((key) => {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    });
    resetEnvCache();
  }
}

describe('production env', () => {
  test('boots with try-on disabled when no FASHN key is set', () => {
    const env = withEnv({
      NODE_ENV: 'production',
      TRYON_PROVIDER: null,
      FASHN_API_KEY: '',
      ALLOW_MOCK_TRYON: 'false',
      TRUST_PROXY: null,
    }, () => loadEnv());
    expect(env.tryOnProvider).toBe('disabled');
    expect(env.trustProxy).toBe(true);
  });

  test('still refuses an explicit mock provider', () => {
    expect(() => withEnv({
      NODE_ENV: 'production',
      TRYON_PROVIDER: 'mock',
      FASHN_API_KEY: '',
      ALLOW_MOCK_TRYON: 'false',
    }, () => loadEnv())).toThrow(/mock try-on provider/);
  });
});
