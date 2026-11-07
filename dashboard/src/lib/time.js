/**
 * Small date helpers for the dashboard.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Local calendar date as YYYY-MM-DD.
 * @param {Date} date
 * @returns {string}
 */
function dayKey(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/**
 * @param {string | number | Date | null | undefined} value
 * @returns {Date | null}
 */
function toDate(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * "just now", "5m ago", "3h ago", "yesterday", "4d ago", then "Oct 3" / "Oct 3, 2025".
 *
 * @param {string | number | Date | null | undefined} value
 * @param {Date} [now]
 * @returns {string}
 */
function relativeTime(value, now = new Date()) {
  const d = toDate(value);
  if (!d) return '';
  const diff = now.getTime() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (diff < min) return 'just now';
  if (diff < hour) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 2 * day) return 'yesterday';
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  const short = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? short : `${short}, ${d.getFullYear()}`;
}

/**
 * "7 Nov, 14:05" in local time, for timelines.
 * @param {string | null | undefined} value
 * @returns {string}
 */
function formatDateTime(value) {
  const d = toDate(value);
  if (!d) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hh}:${mm}`;
}

module.exports = { dayKey, toDate, relativeTime, formatDateTime, MONTHS };
