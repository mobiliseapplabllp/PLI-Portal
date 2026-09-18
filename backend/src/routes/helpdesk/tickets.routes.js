'use strict';

/**
 * Tickets router â€” mounts ticket, conversation, task, and history sub-routes.
 * All routes require helpdeskAuth (applied by the parent index router).
 */

const router   = require('express').Router();
const upload   = require('../../middleware/upload');

const ticketCtrl   = require('../../controllers/helpdesk/ticket.controller');
const convCtrl     = require('../../controllers/helpdesk/conversation.controller');
const taskCtrl     = require('../../controllers/helpdesk/task.controller');
const reminderCtrl = require('../../controllers/helpdesk/reminder.controller');

// â”€â”€ Tickets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/',              ticketCtrl.listTickets);
router.post('/',             upload.single('attachment'), ticketCtrl.createTicket);
router.post('/bulk-assign',  ticketCtrl.bulkAssign);
// Permission guard mirrors the bulkAssign check: admin or canAssign required.
// The controller performs the same check for defence-in-depth.
router.post('/bulk-upload',
  (req, res, next) => {
    if (!req.hdUser?.isAdmin && !req.hdUser?.permissions?.canAssign) {
      return res.status(403).json({ success: false, message: 'You do not have permission to bulk upload tickets' });
    }
    next();
  },
  ticketCtrl.bulkUpload,
);

// Static sub-paths must come before /:id to avoid param capture
router.get('/template/import', ticketCtrl.getImportTemplate);
router.get('/export',          ticketCtrl.exportTickets);

router.get('/:id',           ticketCtrl.getTicket);
// Authorization enforced inside updateTicket (owner or admin/canAssign required)
router.put('/:id',           ticketCtrl.updateTicket);
// Admin-only guard duplicated at route level for defence-in-depth
router.delete('/:id',
  (req, res, next) => {
    if (!req.hdUser?.isAdmin) {
      return res.status(403).json({ success: false, message: 'Only admins can delete tickets' });
    }
    next();
  },
  ticketCtrl.deleteTicket,
);

// â”€â”€ History â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/:id/history',   ticketCtrl.getHistory);

// ── Allocation exception (over-capacity request; decided in /pm/allocation-exceptions) ──
// Permission (admin or canAssign) is enforced in the controller, same as assigning.
router.post('/:id/allocation-exception', ticketCtrl.requestTicketAllocationException);

// â”€â”€ Ticket linking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/:id/link',     ticketCtrl.linkTicket);

// â”€â”€ Conversations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/:id/conversations',  convCtrl.listConversations);
router.post('/:id/conversations', upload.single('file'), convCtrl.addConversation);

router.put('/conversations/:id',    convCtrl.updateConversation);
router.delete('/conversations/:id', convCtrl.deleteConversation);

// â”€â”€ Sub-tasks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/:id/tasks',   taskCtrl.listTasks);
router.post('/:id/tasks',  taskCtrl.createTask);

// â”€â”€ Reminders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/:id/reminders',                        reminderCtrl.listReminders);
router.post('/:id/reminders',                       reminderCtrl.createReminder);
router.delete('/:id/reminders/:reminderId',         reminderCtrl.deleteReminder);

router.put('/tasks/:id',    taskCtrl.updateTask);
router.delete('/tasks/:id', taskCtrl.deleteTask);

module.exports = router;
