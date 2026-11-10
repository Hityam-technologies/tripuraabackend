/**
 * Which browser addresses are allowed to act as the admin panel.
 *
 * ADMIN_ORIGIN can be one address or several, separated by commas.
 * The deployed Vercel admin is included here so login keeps working
 * even when the server still has the local default (http://localhost:5173).
 */

const BUILT_IN_ADMIN_ORIGINS = [
  'https://tsadmin-gilt.vercel.app',
];

function splitOrigins(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function isPreviewAdminHost(hostname) {
  return /^tsadmin-[a-z0-9-]+-hityam-technologies-projects\.vercel\.app$/i.test(hostname);
}

function isAdminOrigin(origin, env) {
  if (!origin) return false;
  const normalized = String(origin).trim().replace(/\/$/, '');
  const allowed = new Set([
    ...splitOrigins(env.ADMIN_ORIGIN),
    ...BUILT_IN_ADMIN_ORIGINS,
  ]);
  if (allowed.has(normalized)) return true;

  try {
    const url = new URL(normalized);
    return url.protocol === 'https:' && isPreviewAdminHost(url.hostname);
  } catch {
    return false;
  }
}

module.exports = { isAdminOrigin, BUILT_IN_ADMIN_ORIGINS };
