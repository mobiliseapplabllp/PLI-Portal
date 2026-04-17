const { Model } = require('sequelize');

/**
 * Recursively map Sequelize `id` → `_id` for API compatibility with the existing React app.
 */
function renameIdsForClient(val) {
  if (val === null || val === undefined) return val;
  if (val instanceof Date) return val;
  if (Array.isArray(val)) return val.map(renameIdsForClient);
  if (val instanceof Model) return renameIdsForClient(val.get({ plain: true }));
  if (typeof val !== 'object') return val;

  const out = { ...val };
  if (Object.prototype.hasOwnProperty.call(out, 'id')) {
    out._id = out.id;
    delete out.id;
  }
  for (const key of Object.keys(out)) {
    out[key] = renameIdsForClient(out[key]);
  }
  return out;
}

module.exports = { renameIdsForClient };
