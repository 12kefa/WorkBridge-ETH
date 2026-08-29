/**
 * Parse a filter query param that represents a list — e.g. `?skills=js,react`
 * or a repeated `?skills=js&skills=react` (which Express parses as an array)
 * — into a clean string array suitable for a Postgres `&&` overlap check
 * against a text[] column.
 *
 * Without this, passing the raw string through as a single-element array
 * (e.g. `['js,react']`) makes `column && $1::text[]` look for one row value
 * that literally equals "js,react" instead of checking for overlap with
 * either "js" or "react" — so multi-value filters silently return nothing.
 *
 * @param {string|string[]|undefined} value
 * @returns {string[]}
 */
const parseListParam = (value) => {
  if (value === undefined || value === null || value === '') return [];
  const parts = Array.isArray(value) ? value : String(value).split(',');
  return parts.map((s) => String(s).trim()).filter(Boolean);
};

module.exports = { parseListParam };
