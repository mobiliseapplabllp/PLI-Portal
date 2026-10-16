const { sequelize } = require('../test/_helpers');
(async () => {
  const [settings] = await sequelize.query("SELECT ticketAllocationAgreementEnabled FROM pm_settings WHERE id=1");
  console.log('Feature flag ticketAllocationAgreementEnabled =', settings[0]?.ticketAllocationAgreementEnabled);

  const [tickets] = await sequelize.query(`
    SELECT t.id, t.req_number, t.title, t.status, t.allocation_total_hours, t.allocation_agreement_status,
           t.assignee_id, t.team_manager_id, t.requester_id,
           a.name AS assignee_name, m.name AS team_manager_name, r.name AS requester_name
    FROM hd_tickets t
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users m ON m.id = t.team_manager_id
    LEFT JOIN users r ON r.id = t.requester_id
    WHERE a.name LIKE '%VEER VIKRAM%'
    ORDER BY t.created_at DESC
    LIMIT 5
  `);
  console.log(tickets);

  await sequelize.close();
})();
