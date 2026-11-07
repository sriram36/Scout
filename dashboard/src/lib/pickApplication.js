/**
 * PostgREST embeds a to-one relation (a foreign key that is unique, like
 * applications.listing_id) as a single object or null, and a to-many relation as an
 * array. Accept both so the dashboard keeps working if the schema changes.
 *
 * @template T
 * @param {T | T[] | null | undefined} embedded
 * @returns {T | null}
 */
function pickApplication(embedded) {
  if (Array.isArray(embedded)) return embedded[0] ?? null;
  return embedded ?? null;
}

module.exports = { pickApplication };
