const { getEnv } = require('../../config/env');
const { MockProvider } = require('./mock.provider');
const { FashnProvider } = require('./fashn.provider');
const { JobRunner } = require('./jobRunner');

function createProvider() {
  return getEnv().tryOnProvider === 'fashn' ? new FashnProvider() : new MockProvider();
}

function createRuntime(options = {}) {
  const provider = options.provider || createProvider();
  const runner = new JobRunner({ provider, ...options });
  return { provider, runner };
}

module.exports = { createProvider, createRuntime };
