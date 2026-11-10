const SENSITIVE = /password|token|secret|otp|authorization|cookie|apikey|api_key|image|base64|portrait|refresh/i;

function redact(value, depth = 0) {
  if (depth > 6 || value == null) return value;
  if (typeof value === 'string') {
    if (value.startsWith('data:image') || value.length > 2000) return '[redacted]';
    return value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE.test(key)) out[key] = '[redacted]';
      else out[key] = redact(item, depth + 1);
    }
    return out;
  }
  return value;
}

function formatInr(amount) {
  const value = Number(amount) || 0;
  return `₹${value.toLocaleString('en-IN')}`;
}

function parsePagination(query, { maxLimit = 50, defaultLimit = 20 } = {}) {
  return {
    page: query.page,
    limit: query.limit ?? defaultLimit,
    maxLimit,
  };
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

module.exports = { redact, formatInr, parsePagination, slugify };
