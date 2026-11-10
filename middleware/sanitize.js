function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const clean = {};
    for (const [key, item] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.')) continue;
      clean[key] = scrub(item);
    }
    return clean;
  }
  return value;
}

function sanitize(req, _res, next) {
  if (req.body && typeof req.body === 'object') req.body = scrub(req.body);
  req.safeQuery = scrub(req.query || {});
  req.safeParams = scrub(req.params || {});
  next();
}

module.exports = { sanitize, scrub };
