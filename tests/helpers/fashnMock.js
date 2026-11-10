const { setFetchImpl } = require('../../services/tryon/fashn.client');

function fashnMock(sequence) {
  const calls = [];
  setFetchImpl(async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null, method: options.method });
    const next = typeof sequence === 'function' ? sequence(calls.length, url) : sequence.shift();
    const payload = next || { status: 500, body: { error: 'InternalServerError' } };
    return {
      ok: payload.status >= 200 && payload.status < 300,
      status: payload.status,
      text: async () => JSON.stringify(payload.body || {}),
    };
  });
  return calls;
}

function resetFetch() {
  setFetchImpl(null);
}

module.exports = { fashnMock, resetFetch };
