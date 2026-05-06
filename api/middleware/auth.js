/**
 * API key check for Pi-facing write endpoints.
 * If API_KEY env var is not set, auth is disabled (for local dev).
 */
module.exports = function requireApiKey(req, res, next) {
  const configured = process.env.API_KEY;
  if (!configured) return next();
  if (req.headers['x-api-key'] === configured) return next();
  res.status(401).json({ error: 'Invalid or missing X-Api-Key header' });
};
