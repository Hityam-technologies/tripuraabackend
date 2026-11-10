const { getEnv } = require('../../config/env');
const { MockProvider } = require('./mock.provider');
const { FashnProvider } = require('./fashn.provider');
const { JobRunner } = require('./jobRunner');

class DisabledProvider {
  constructor() {
    this.name = 'disabled';
    this.runCalls = 0;
  }

  async run() {
    const error = new Error('Virtual try-on is not configured.');
    error.code = 'TRYON_UNAVAILABLE';
    throw error;
  }

  async status() {
    return { status: 'failed', output: null, error: { name: 'Disabled', message: 'Virtual try-on is not configured.' } };
  }

  async credits() {
    return { credits: null, unavailable: true };
  }
}

function createProvider() {
  const provider = getEnv().tryOnProvider;
  if (provider === 'fashn') return new FashnProvider();
  if (provider === 'disabled') return new DisabledProvider();
  return new MockProvider();
}

function createRuntime(options = {}) {
  const provider = options.provider || createProvider();
  const runner = new JobRunner({ provider, ...options });
  return { provider, runner };
}

module.exports = { createProvider, createRuntime };
