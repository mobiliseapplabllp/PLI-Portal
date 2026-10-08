'use strict';
/**
 * Resolves ticket status by stable reference instead of hardcoded strings, so
 * an admin renaming a status option (migration 055/056) never silently breaks
 * SLA counts, the closedAt auto-stamp, or the approval flow.
 *
 * - Behavioral code ("is this ticket done?") asks for built-in KEYS, which
 *   never change even if the display name does.
 * - Any code SETTING ticket.status from an incoming string (a form/API value,
 *   which is always the CURRENT display name) resolves it by NAME to get the
 *   matching id, and must set both `status` and `statusId` together.
 */
const HdOption = require('../../models/helpdesk/HdOption');
const { ValidationError } = require('../../utils/errors');

/** The current hd_options row for a built-in status, by its permanent key. */
async function getBuiltInStatus(key) {
  const opt = await HdOption.findOne({ where: { type: 'status', builtInKey: key } });
  if (!opt) throw new ValidationError(`Built-in status "${key}" not found in hd_options — did migration 056 run?`);
  return opt;
}

/** ids for a set of built-in keys, e.g. getStatusIdsByKeys(['resolved','closed']). */
async function getStatusIdsByKeys(keys) {
  const opts = await HdOption.findAll({ where: { type: 'status', builtInKey: keys } });
  return opts.map(o => o.id);
}

/** ids that count as "done" — used by every SLA/aging/unassigned-open query. */
const getClosedStatusIds = () => getStatusIdsByKeys(['resolved', 'closed']);

/** Resolve an incoming status NAME (current display label) to its hd_options row. */
async function resolveStatusByName(name) {
  const opt = await HdOption.findOne({ where: { type: 'status', name } });
  if (!opt) throw new ValidationError(`Unknown status "${name}" — it may have just been renamed. Please refresh and try again.`);
  return opt;
}

module.exports = { getBuiltInStatus, getStatusIdsByKeys, getClosedStatusIds, resolveStatusByName };
