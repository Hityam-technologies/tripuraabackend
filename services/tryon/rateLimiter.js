class TokenBucket {
  constructor({ capacity, refillMs }) {
    this.capacity = capacity;
    this.refillMs = refillMs;
    this.tokens = capacity;
    this.updatedAt = Date.now();
  }

  refill(now = Date.now()) {
    const elapsed = now - this.updatedAt;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + (elapsed / this.refillMs) * this.capacity);
    this.updatedAt = now;
  }

  tryTake(now = Date.now()) {
    this.refill(now);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

class Semaphore {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.peak = 0;
  }

  tryAcquire() {
    if (this.active >= this.max) return false;
    this.active += 1;
    this.peak = Math.max(this.peak, this.active);
    return true;
  }

  release() {
    this.active = Math.max(0, this.active - 1);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const {
  FASHN_MAX_CONCURRENT,
  FASHN_RUN_LIMIT,
  FASHN_RUN_WINDOW_MS,
  FASHN_STATUS_LIMIT,
  FASHN_STATUS_WINDOW_MS,
} = require('../../config/constants');

function createLimiters() {
  return {
    runBucket: new TokenBucket({ capacity: FASHN_RUN_LIMIT, refillMs: FASHN_RUN_WINDOW_MS }),
    statusBucket: new TokenBucket({ capacity: FASHN_STATUS_LIMIT, refillMs: FASHN_STATUS_WINDOW_MS }),
    concurrency: new Semaphore(FASHN_MAX_CONCURRENT),
  };
}

module.exports = { TokenBucket, Semaphore, sleep, createLimiters };
