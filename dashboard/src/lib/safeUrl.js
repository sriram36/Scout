/**
 * Only http(s) URLs may become links: listing URLs come from third-party job APIs.
 * @param {unknown} value
 * @returns {string | null} the trimmed URL, or null when it is missing or not http(s)
 */
function safeHttpUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const { protocol } = new URL(trimmed);
    return protocol === 'http:' || protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
}

module.exports = { safeHttpUrl };
