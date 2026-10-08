'use strict';
// Bulk project import (Client + Project Name spreadsheet) — migration 054.
// Every project created this way is Operations-only (no milestones), Billable,
// tagged with the admin-configured default project type, and stamped with a
// shared importBatchId so a bad import can be undone as one unit.
const { randomUUID } = require('crypto');
const sequelize = require('../../config/database');
const Project = require('../../models/pm/Project');
const ClientOrganisation = require('../../models/csat/ClientOrganisation');
const PmProjectType = require('../../models/pm/PmProjectType');
const PmImportLog = require('../../models/pm/PmImportLog');
const PmSettings = require('../../models/pm/PmSettings');
const { ValidationError } = require('../../utils/errors');

const EXPECTED_HEADERS = ['client', 'projectname'];

const normaliseHeader = (h) => String(h || '').trim().toLowerCase().replace(/[^a-z]/g, '');
const normaliseKey = (v) => String(v || '').trim().toLowerCase();

/** Rejects a file whose headers don't include Client + Project Name (S.No or other extra columns are fine). */
function assertHeadersValid(headerRow) {
  const normalised = (headerRow || []).map(normaliseHeader);
  const missing = EXPECTED_HEADERS.filter(h => !normalised.includes(h));
  if (missing.length > 0) {
    throw new ValidationError(
      `File is missing required column(s): ${missing.includes('client') ? 'Client' : ''}${missing.length === 2 ? ', ' : ''}${missing.includes('projectname') ? 'Project Name' : ''}. ` +
      `Download the template to see the expected format.`
    );
  }
}

/**
 * Parses raw sheet rows (array of objects keyed however the sheet library returns them)
 * into { client, projectName } pairs, using normalised header matching so "Client",
 * "client ", "CLIENT" all resolve the same way.
 */
function extractRows(rawRows) {
  return rawRows.map((row, idx) => {
    const entries = Object.entries(row || {});
    const clientEntry = entries.find(([k]) => normaliseHeader(k) === 'client');
    const nameEntry = entries.find(([k]) => normaliseHeader(k) === 'projectname');
    return {
      rowNumber: idx + 2, // header is row 1
      client: clientEntry ? String(clientEntry[1] ?? '').trim() : '',
      projectName: nameEntry ? String(nameEntry[1] ?? '').trim() : '',
    };
  });
}

/**
 * Resolves each row against the database WITHOUT writing anything — shared by
 * dry-run (preview) and confirm (which reuses this then writes). A per-run cache
 * makes repeated client names in one file resolve to one org, in-memory, so
 * "Sodexo" on rows 1 and 2 never becomes two orgs even before the first is saved.
 *
 * The stored project name follows the SAME "ClientOrg - ProjectName" convention
 * as the manual Create Project form (CreateProject.jsx), so a project always
 * displays consistently no matter which flow created it. Because the client name
 * is baked into the full name this way, plain global name-uniqueness (same rule
 * assertNameIsFree uses) already scopes correctly per client — "OpSuite" under
 * two different clients produces two different full names, never a clash.
 */
async function resolvePreview(rows) {
  const cache = new Map(); // normalised client name -> { name, isNew }
  const seenFullNames = new Set();
  const existingOrgs = await ClientOrganisation.findAll({ attributes: ['id', 'name'] });
  const orgByName = new Map(existingOrgs.map(o => [normaliseKey(o.name), o]));
  const existingProjects = await Project.findAll({ attributes: ['name'] });
  const existingNames = new Set(existingProjects.map(p => normaliseKey(p.name)));

  const preview = rows.map(r => {
    const errors = [];
    if (!r.client) errors.push('Client is required');
    // Project Name is optional — a blank one creates a project named after the
    // client alone (e.g. "Sodexo HITES"); a later row with the same client and
    // an actual project name still creates a distinct "Sodexo HITES - AI".

    let orgAction = null; // 'reuse' | 'create'
    let orgDisplayName = r.client;
    if (r.client) {
      const key = normaliseKey(r.client);
      if (!cache.has(key)) {
        // First time this client name appears in the file: it either already
        // exists in the DB (reuse) or this row is the one that introduces it
        // (create). Every LATER row with the same client — even one this run
        // is about to create — reuses that same org, never creates a second one.
        const existing = orgByName.get(key);
        cache.set(key, { name: existing ? existing.name : r.client, isNew: !existing });
        orgAction = existing ? 'reuse' : 'create';
      } else {
        orgAction = 'reuse';
      }
      orgDisplayName = cache.get(key).name;
    }

    const fullName = r.client
      ? (r.projectName ? `${orgDisplayName} - ${r.projectName}` : orgDisplayName)
      : '';

    let projectAction = null; // 'create' | 'skip'
    if (fullName) {
      const key = normaliseKey(fullName);
      if (existingNames.has(key) || seenFullNames.has(key)) {
        projectAction = 'skip';
        errors.push(`Project "${fullName}" already exists`);
      } else {
        projectAction = 'create';
        seenFullNames.add(key);
      }
    }

    return { ...r, fullName, errors, valid: errors.length === 0, orgAction, projectAction };
  });

  return preview;
}

const dryRun = async (rawRows) => {
  const rows = extractRows(rawRows);
  const preview = await resolvePreview(rows);
  return {
    rows: preview,
    totalRows: preview.length,
    validCount: preview.filter(r => r.valid).length,
    errorCount: preview.filter(r => !r.valid).length,
  };
};

const confirmImport = async (rawRows, user, fileName) => {
  const rows = extractRows(rawRows);
  const preview = await resolvePreview(rows);
  const validRows = preview.filter(r => r.valid);

  const batchId = randomUUID();
  const orgCache = new Map(); // normalised name -> ClientOrganisation instance
  let orgsCreated = 0, orgsReused = 0, projectsCreated = 0;
  const rowErrors = preview.filter(r => !r.valid).map(r => ({ row: r.rowNumber, errors: r.errors }));

  const settings = await PmSettings.findByPk(1);
  const defaultTypeId = settings?.defaultBulkImportProjectTypeId || null;
  const defaultType = defaultTypeId ? await PmProjectType.findByPk(defaultTypeId) : null;

  const t = await sequelize.transaction();
  try {
    for (const row of validRows) {
      const key = normaliseKey(row.client);
      let org = orgCache.get(key);
      if (!org) {
        const existing = await ClientOrganisation.findOne({ where: { name: row.client }, transaction: t });
        if (existing) {
          org = existing;
          orgsReused++;
        } else {
          org = await ClientOrganisation.create({ name: row.client, importBatchId: batchId }, { transaction: t });
          orgsCreated++;
        }
        orgCache.set(key, org);
      }

      await Project.create({
        name: row.fullName || `${org.name} - ${row.projectName}`,
        clientName: org.name,
        clientOrgId: org.id,
        billingType: 'Billable',
        projectType: defaultType?.name || null,
        projectTypeId: defaultType?.id || null,
        isProduct: false,
        isOperations: true,
        status: 'Yet to Start',
        createdById: user._id ?? user.id,
        importBatchId: batchId,
      }, { transaction: t });
      projectsCreated++;
    }

    await PmImportLog.create({
      batchId,
      fileName: fileName || null,
      importedById: user._id ?? user.id,
      orgsCreated, orgsReused, projectsCreated,
      projectsSkipped: rowErrors.length,
      rowErrors: rowErrors.length ? rowErrors : null,
      status: 'completed',
    }, { transaction: t });

    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }

  return {
    batchId,
    orgsCreated, orgsReused, projectsCreated,
    projectsSkipped: rowErrors.length,
    rowErrors,
  };
};

const listImportLogs = async () => {
  return PmImportLog.findAll({
    order: [['createdAt', 'DESC']],
    limit: 100,
    include: [{ association: 'importedBy', attributes: ['id', 'name', 'email'], required: false }],
  });
};

/** Deletes every project created by this batch. Client orgs are left in place —
 * they may already be referenced by other data by the time an undo happens. */
const undoImport = async (batchId) => {
  const log = await PmImportLog.findOne({ where: { batchId } });
  if (!log) throw new ValidationError('Import batch not found');
  if (log.status === 'undone') throw new ValidationError('This import was already undone');

  const t = await sequelize.transaction();
  try {
    const removed = await Project.destroy({ where: { importBatchId: batchId }, transaction: t });
    log.status = 'undone';
    await log.save({ transaction: t });
    await t.commit();
    return { removedProjects: removed };
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

module.exports = { assertHeadersValid, dryRun, confirmImport, listImportLogs, undoImport, EXPECTED_HEADERS };
