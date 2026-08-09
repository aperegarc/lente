// Validación compartida en rutas API

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export function clampInt(value, min, max, fallback) {
  const n = parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeText(value, maxLen) {
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!s) return '';
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

export function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

export function publicError(res, status, message) {
  return res.status(status).json({ error: message });
}
