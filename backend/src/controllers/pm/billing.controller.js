const billingService = require('../../services/pm/billing.service');
const { sendSuccess } = require('../../utils/response');

const getRegister = async (req, res, next) => {
  try {
    sendSuccess(res, await billingService.getBillingRegister(req.user, req.query));
  } catch (err) { next(err); }
};

const markBilled = async (req, res, next) => {
  try {
    const project = await billingService.markBilled(req.params.id, req.body, req.user);
    sendSuccess(res, project, `Invoice ${project.invoiceNumber} recorded`);
  } catch (err) { next(err); }
};

const unmarkBilled = async (req, res, next) => {
  try {
    sendSuccess(res, await billingService.unmarkBilled(req.params.id, req.body, req.user), 'Billing entry reversed');
  } catch (err) { next(err); }
};

const exportRegister = async (req, res, next) => {
  try {
    const { buffer, filename } = await billingService.exportBillingExcel(req.user, req.query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (err) { next(err); }
};

module.exports = { getRegister, markBilled, unmarkBilled, exportRegister };
