const { sendSuccess } = require('../../utils/response');
const PmFinancialDetail = require('../../models/pm/PmFinancialDetail');
const Project           = require('../../models/pm/Project');
const { randomUUID }    = require('crypto');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

const MANAGERS = ['admin', 'manager', 'senior_manager'];

const get = async (req, res, next) => {
  try {
    let fin = await PmFinancialDetail.findOne({ where: { projectId: req.params.id } });
    // Auto-create empty record if none exists
    if (!fin) {
      fin = { projectId: req.params.id, currency: 'INR', budgetAmount: null, actualCost: null, invoicedAmount: null, paymentTerms: null, notes: null };
    }
    sendSuccess(res, fin);
  } catch (e) { next(e); }
};

const upsert = async (req, res, next) => {
  try {
    const project = await Project.findByPk(req.params.id);
    if (!project) throw new NotFoundError('Project');
    if (!MANAGERS.includes(req.user.role) && String(project.managerId) !== String(req.user._id ?? req.user.id)) {
      throw new ForbiddenError('Only project manager or admin can update financial details');
    }
    const { currency, budgetAmount, actualCost, invoicedAmount, paymentTerms, notes } = req.body;
    const [fin] = await PmFinancialDetail.findOrCreate({
      where: { projectId: req.params.id },
      defaults: { id: randomUUID(), projectId: req.params.id, currency: 'INR' },
    });
    if (currency       !== undefined) fin.currency       = currency;
    if (budgetAmount   !== undefined) fin.budgetAmount   = budgetAmount;
    if (actualCost     !== undefined) fin.actualCost     = actualCost;
    if (invoicedAmount !== undefined) fin.invoicedAmount = invoicedAmount;
    if (paymentTerms   !== undefined) fin.paymentTerms   = paymentTerms;
    if (notes          !== undefined) fin.notes          = notes;
    fin.updatedById = req.user._id ?? req.user.id;
    await fin.save();
    sendSuccess(res, fin, 'Financial details updated');
  } catch (e) { next(e); }
};

module.exports = { get, upsert };
