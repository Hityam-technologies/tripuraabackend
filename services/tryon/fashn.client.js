const { logger } = require('../../config/logger');
const { getEnv } = require('../../config/env');

let fetchImpl = (...args) => global.fetch(...args);

function setFetchImpl(fn) {
  fetchImpl = fn || ((...args) => global.fetch(...args));
}

class FashnClient {
  constructor({ apiKey, baseUrl = 'https://api.fashn.ai' } = {}) {
    this.apiKey = apiKey || '';
    this.baseUrl = baseUrl;
  }

  async request(path, { method = 'GET', body, timeoutMs = 30000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const response = await fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      let json = {};
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = { message: 'Unreadable provider response' };
        }
      }
      logger.info('fashn response', {
        path: path.split('?')[0],
        status: response.status,
        ms: Date.now() - started,
      });
      return { ok: response.ok, status: response.status, body: json };
    } catch (error) {
      logger.warn('fashn network error', { path: path.split('?')[0], name: error.name });
      return { ok: false, status: 0, body: { error: 'NetworkError', message: 'network' }, network: true };
    } finally {
      clearTimeout(timer);
    }
  }

  buildInputs(modelName, modelImage, garmentImage) {
    if (modelName === 'tryon-max') {
      return {
        model_image: modelImage,
        product_image: garmentImage,
        resolution: '1k',
        generation_mode: 'balanced',
        num_images: 1,
        output_format: 'jpeg',
      };
    }
    return {
      model_image: modelImage,
      garment_image: garmentImage,
      category: 'one-pieces',
      garment_photo_type: 'flat-lay',
      mode: 'balanced',
      num_samples: 1,
      output_format: 'jpeg',
      moderation_level: 'conservative',
    };
  }

  async run({ modelName, modelImage, garmentImage, webhookUrl }) {
    const query = webhookUrl ? `?webhook_url=${encodeURIComponent(webhookUrl)}` : '';
    return this.request(`/v1/run${query}`, {
      method: 'POST',
      body: {
        model_name: modelName,
        inputs: this.buildInputs(modelName, modelImage, garmentImage),
      },
    });
  }

  async status(id) {
    return this.request(`/v1/status/${encodeURIComponent(id)}`);
  }

  async credits() {
    return this.request('/v1/credits');
  }
}

function createFashnClient() {
  return new FashnClient({ apiKey: getEnv().FASHN_API_KEY });
}

module.exports = { FashnClient, createFashnClient, setFetchImpl };
