const { createFashnClient } = require('./fashn.client');
const { mapHttpError, mapRuntimeError } = require('./errorMapper');
const { logger } = require('../../config/logger');

const creditCache = { at: 0, value: null };

class FashnProvider {
  constructor(client) {
    this.name = 'fashn';
    this.client = client || createFashnClient();
    this.runCalls = 0;
  }

  async run(input) {
    this.runCalls += 1;
    const result = await this.client.run(input);
    if (!result.ok) {
      const mapped = result.network
        ? { code: 'TRYON_UNAVAILABLE', message: 'Virtual try-on is temporarily unavailable.', retry: true }
        : mapHttpError(result.status, result.body);
      const error = new Error(mapped.message);
      error.code = mapped.code;
      error.retry = mapped.retry;
      error.providerStatus = result.status;
      throw error;
    }
    if (!result.body?.id) {
      const error = new Error('Virtual try-on is temporarily unavailable.');
      error.code = 'TRYON_UNAVAILABLE';
      error.retry = false;
      throw error;
    }
    return { id: result.body.id };
  }

  async status(id) {
    const result = await this.client.status(id);
    if (!result.ok) {
      const mapped = result.network
        ? { code: 'TRYON_BUSY', message: 'The studio is busy. Please try again in a moment.', retry: true }
        : mapHttpError(result.status, result.body);
      const error = new Error(mapped.message);
      error.code = mapped.code;
      error.retry = mapped.retry;
      throw error;
    }
    const body = result.body || {};
    if (body.status === 'failed' && body.error) {
      const mapped = mapRuntimeError(body.error);
      return { status: 'failed', error: { name: body.error.name, code: mapped.code, message: mapped.message }, retry: false };
    }
    return {
      status: body.status,
      output: body.output,
      error: body.error,
      creditsUsed: body.creditsUsed,
    };
  }

  async credits() {
    if (creditCache.value && Date.now() - creditCache.at < 60000) return creditCache.value;
    try {
      const result = await this.client.credits();
      if (!result.ok) throw new Error('credits failed');
      const credits = Number(result.body.credits ?? result.body.credits_remaining);
      const value = { credits: Number.isFinite(credits) ? credits : null, unavailable: !Number.isFinite(credits) };
      creditCache.at = Date.now();
      creditCache.value = value;
      return value;
    } catch (error) {
      logger.warn('fashn credits unavailable', { name: error.name });
      return { credits: null, unavailable: true };
    }
  }
}

module.exports = { FashnProvider, creditCache };
