import { getDatabase } from './db.js';

export class ApprovalEngine {
  async getPendingApprovals() {
    const db = await getDatabase();
    return await db.all(`
      SELECT * FROM approvals 
      WHERE status = 'pending' 
      AND expires_at > datetime('now')
      ORDER BY created_at DESC
    `);
  }

  async approveDecision(approvalId, approvedBy) {
    const db = await getDatabase();

    try {
      const approval = await db.get(
        `SELECT * FROM approvals WHERE id = ?`,
        [approvalId]
      );

      if (!approval) {
        return { success: false, error: 'Approval not found' };
      }

      // Update approval status
      await db.run(
        `UPDATE approvals SET status = 'approved', approved_by = ? WHERE id = ?`,
        [approvedBy, approvalId]
      );

      // Log activity
      await db.run(
        `INSERT INTO activity_logs (agent_type, action_type, customer_id, contract_id, result, status, details)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          approval.agent_type,
          approval.action_type,
          approval.customer_id,
          approval.contract_id,
          'approved',
          'executed',
          JSON.stringify({ approved_by: approvedBy, decision_data: approval.decision_data })
        ]
      );

      // Execute the action based on type
      await this.executeApprovedAction(approval);

      return { success: true, message: 'Decision approved and executed' };
    } catch (error) {
      console.error('Approval Error:', error);
      return { success: false, error: error.message };
    }
  }

  async rejectDecision(approvalId, rejectedBy, reason) {
    const db = await getDatabase();

    try {
      const approval = await db.get(
        `SELECT * FROM approvals WHERE id = ?`,
        [approvalId]
      );

      if (!approval) {
        return { success: false, error: 'Approval not found' };
      }

      // Update approval status
      await db.run(
        `UPDATE approvals SET status = 'rejected', approved_by = ?, rejected_reason = ? WHERE id = ?`,
        [rejectedBy, reason, approvalId]
      );

      // Log activity
      await db.run(
        `INSERT INTO activity_logs (agent_type, action_type, customer_id, contract_id, result, status, details)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          approval.agent_type,
          approval.action_type,
          approval.customer_id,
          approval.contract_id,
          'rejected',
          'cancelled',
          JSON.stringify({ rejected_by: rejectedBy, reason: reason })
        ]
      );

      return { success: true, message: 'Decision rejected' };
    } catch (error) {
      console.error('Rejection Error:', error);
      return { success: false, error: error.message };
    }
  }

  async executeApprovedAction(approval) {
    const db = await getDatabase();

    try {
      const decision = JSON.parse(approval.decision_data);

      switch (approval.action_type) {
        case 'apply_discount':
          await this.sendDiscountEmail(approval.customer_id, decision);
          break;
        case 'send_upsell_offer':
          await this.sendUpsellEmail(approval.customer_id, decision);
          break;
        case 'send_renegotiation_proposal':
          await this.sendRenegotiationEmail(approval.contract_id, decision);
          break;
        default:
          console.log('Unknown action type:', approval.action_type);
      }

      // Update upsell opportunity status if applicable
      if (approval.customer_id) {
        await db.run(
          `UPDATE upsell_opportunities SET status = 'sent' WHERE customer_id = ? AND status = 'pending'`,
          [approval.customer_id]
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Action Execution Error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendDiscountEmail(customerId, decision) {
    // In production, integrate with email service (SendGrid, AWS SES, etc.)
    console.log(`📧 Sending discount email to customer ${customerId}:`, decision);
    return true;
  }

  async sendUpsellEmail(customerId, decision) {
    // In production, integrate with email service
    console.log(`📧 Sending upsell email to customer ${customerId}:`, decision);
    return true;
  }

  async sendRenegotiationEmail(contractId, decision) {
    // In production, integrate with email service
    console.log(`📧 Sending renegotiation email for contract ${contractId}:`, decision);
    return true;
  }

  async getApprovalStats() {
    const db = await getDatabase();

    const stats = await db.all(`
      SELECT 
        status,
        COUNT(*) as count
      FROM approvals
      GROUP BY status
    `);

    return stats.reduce((acc, stat) => {
      acc[stat.status] = stat.count;
      return acc;
    }, {});
  }

  async cleanupExpiredApprovals() {
    const db = await getDatabase();

    const result = await db.run(`
      DELETE FROM approvals 
      WHERE status = 'pending' 
      AND expires_at < datetime('now')
    `);

    console.log(`🧹 Cleaned up ${result.changes} expired approvals`);
    return result.changes;
  }
}

export default new ApprovalEngine();
