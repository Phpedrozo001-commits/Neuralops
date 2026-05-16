// approval.js
import { getDatabase } from './db.js';
import { sendEmail, buildChurnRetentionEmail, buildUpsellEmail, buildRenegotiationEmail } from './services/email.js';
import { sendEmailForUser } from './services/gmailService.js';

export class ApprovalEngine {
  async getPendingApprovals() {
    const db = await getDatabase();
    const approvals = await db.all(`
      SELECT 
        a.*,
        c.name as customer_name,
        c.email as customer_email,
        c.mrr as customer_mrr,
        ct.vendor_name
      FROM approvals a
      LEFT JOIN customers c ON a.customer_id = c.id
      LEFT JOIN contracts ct ON a.contract_id = ct.id
      WHERE a.status = 'pending' 
      ORDER BY a.created_at DESC
    `);

    // Enriquece com dados da decision_data
    return approvals.map(a => {
      try {
        const data = JSON.parse(a.decision_data || '{}');
        return {
          ...a,
          details: this.formatApprovalDetails(a, data),
          parsed_data: data
        };
      } catch {
        return a;
      }
    });
  }

  formatApprovalDetails(approval, data) {
    switch (approval.action_type) {
      case 'apply_discount':
        return `<strong>Ação:</strong> Enviar email de retenção${data.discount_percent ? ` + desconto ${data.discount_percent}%` : ''}<br>
                <strong>Risco:</strong> ${data.risk_level || 'alto'} (score: ${data.risk_score || '—'})<br>
                <strong>MRR em risco:</strong> $${data.mrr || approval.customer_mrr || 0}/mês<br>
                ${data.retention_message ? `<strong>Mensagem:</strong> ${data.retention_message.substring(0, 150)}...` : ''}`;

      case 'send_upsell_offer':
        return `<strong>Ação:</strong> Enviar proposta de upsell<br>
                <strong>Tipo:</strong> ${data.opportunity_type || 'upsell'}<br>
                <strong>Valor estimado:</strong> $${Number(data.estimated_value || 0).toLocaleString()}/ano<br>
                <strong>Confiança:</strong> ${data.confidence || 0}%<br>
                ${data.recommended_offer ? `<strong>Oferta:</strong> ${data.recommended_offer}` : ''}`;

      case 'send_renegotiation_proposal':
        return `<strong>Ação:</strong> Enviar proposta de renegociação para ${data.vendor_name || 'fornecedor'}<br>
                <strong>Custo atual:</strong> $${Number(data.current_cost || 0).toLocaleString()}/ano<br>
                <strong>Taxa de mercado:</strong> $${Number(data.market_rate || 0).toLocaleString()}/ano<br>
                <strong>Economia potencial:</strong> $${Number(data.potential_savings || 0).toLocaleString()}/ano<br>
                <strong>Probabilidade de sucesso:</strong> ${data.success_probability || 0}%`;

      default:
        return `<strong>Ação:</strong> ${approval.action_type}<br>${JSON.stringify(data).substring(0, 200)}`;
    }
  }

  async approveDecision(approvalId, approvedBy) {
    const db = await getDatabase();

    try {
      const approval = await db.get(`SELECT * FROM approvals WHERE id = ?`, [approvalId]);
      if (!approval) return { success: false, error: 'Aprovação não encontrada' };
      if (approval.status !== 'pending') return { success: false, error: `Aprovação já foi ${approval.status}` };

      // Atualiza status
      await db.run(
        `UPDATE approvals SET status = 'approved', approved_by = ? WHERE id = ?`,
        [String(approvedBy), approvalId]
      );

      // Executa a ação (envia email real)
      const actionResult = await this.executeApprovedAction(approval, approvedBy);

      // Log de auditoria
      await db.run(
        `INSERT INTO activity_logs (agent_type, action_type, customer_id, contract_id, result, status, details)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          approval.agent_type,
          approval.action_type,
          approval.customer_id,
          approval.contract_id,
          'approved',
          actionResult.email_sent ? 'email_sent' : 'approved_no_email',
          JSON.stringify({ approved_by: approvedBy, action_result: actionResult })
        ]
      );

      return {
        success: true,
        message: 'Decisão aprovada e executada',
        email_sent: actionResult.email_sent || false,
        email_simulated: actionResult.email_simulated || false,
        details: actionResult
      };

    } catch (error) {
      console.error('Approval Error:', error);
      return { success: false, error: error.message };
    }
  }

  async rejectDecision(approvalId, rejectedBy, reason) {
    const db = await getDatabase();

    try {
      const approval = await db.get(`SELECT * FROM approvals WHERE id = ?`, [approvalId]);
      if (!approval) return { success: false, error: 'Aprovação não encontrada' };

      await db.run(
        `UPDATE approvals SET status = 'rejected', approved_by = ?, rejected_reason = ? WHERE id = ?`,
        [String(rejectedBy), reason || 'Rejeitado pelo usuário', approvalId]
      );

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
          JSON.stringify({ rejected_by: rejectedBy, reason })
        ]
      );

      return { success: true, message: 'Decisão rejeitada com sucesso' };

    } catch (error) {
      console.error('Rejection Error:', error);
      return { success: false, error: error.message };
    }
  }

  async executeApprovedAction(approval, approvedByUserId) {
    const db = await getDatabase();

    try {
      let decision = {};
      try { decision = JSON.parse(approval.decision_data || '{}'); } catch {}

      // Função helper: envia email pelo Gmail do cliente ou fallback para Resend
      const sendSmartEmail = async (emailData) => {
        if (approvedByUserId) {
          const gmailResult = await sendEmailForUser(db, approvedByUserId, emailData);
          if (gmailResult.success) return gmailResult;
          console.log(`⚠️ Gmail falhou (${gmailResult.error}), tentando Resend...`);
        }
        return sendEmail(emailData);
      };

      let emailResult = { success: false };

      switch (approval.action_type) {
        case 'apply_discount': {
          // Busca dados do cliente
          const customer = approval.customer_id 
            ? await db.get(`SELECT * FROM customers WHERE id = ?`, [approval.customer_id])
            : null;

          if (customer?.email) {
            const { subject, html, text } = buildChurnRetentionEmail({
              customerName: customer.name || decision.customer_name,
              riskLevel: decision.risk_level || 'high',
              retentionMessage: decision.retention_message,
              discountPercent: decision.discount_percent,
              managerName: 'Equipe NeuralOps'
            });
            emailResult = await sendSmartEmail({ to: customer.email, subject, html, text });
          }

          // Atualiza oportunidades de upsell relacionadas
          if (approval.customer_id) {
            await db.run(
              `UPDATE upsell_opportunities SET status = 'retention_in_progress' WHERE customer_id = ? AND status = 'pending'`,
              [approval.customer_id]
            ).catch(() => {});
          }
          break;
        }

        case 'send_upsell_offer': {
          const customer = approval.customer_id
            ? await db.get(`SELECT * FROM customers WHERE id = ?`, [approval.customer_id])
            : null;

          if (customer?.email) {
            const { subject, html, text } = buildUpsellEmail({
              customerName: customer.name || decision.customer_name,
              opportunityType: decision.opportunity_type,
              salesPitch: decision.sales_pitch,
              recommendedOffer: decision.recommended_offer,
              estimatedValue: decision.estimated_value
            });
            emailResult = await sendSmartEmail({ to: customer.email, subject, html, text });
          }

          // Marca oportunidade como enviada
          if (approval.customer_id) {
            await db.run(
              `UPDATE upsell_opportunities SET status = 'sent' WHERE customer_id = ? AND status = 'pending'`,
              [approval.customer_id]
            ).catch(() => {});
          }
          break;
        }

        case 'send_renegotiation_proposal': {
          // Para contratos, o email vai para o vendor ou para o usuário da conta
          const vendorContactEmail = process.env.VENDOR_CONTACT_EMAIL;
          const accountEmail = process.env.ACCOUNT_EMAIL;
          const toEmail = vendorContactEmail || accountEmail;

          if (toEmail) {
            const { subject, html, text } = buildRenegotiationEmail({
              vendorName: decision.vendor_name,
              currentCost: decision.current_cost,
              marketRate: decision.market_rate,
              savings: decision.potential_savings,
              negotiationEmail: decision.negotiation_email
            });

            emailResult = await sendEmail({ to: toEmail, subject, html, text });
          } else {
            // Sem email configurado, simula mas avisa
            emailResult = {
              success: true,
              simulated: true,
              message: 'Configure VENDOR_CONTACT_EMAIL ou ACCOUNT_EMAIL no Railway para envio real'
            };
            console.log(`📧 Email de renegociação gerado para ${decision.vendor_name}:`);
            console.log(decision.negotiation_email);
          }

          // Marca contrato para acompanhamento
          if (approval.contract_id) {
            await db.run(
              `UPDATE contracts SET status = 'renegotiation_pending' WHERE id = ?`,
              [approval.contract_id]
            ).catch(() => {});
          }
          break;
        }

        default:
          console.log(`⚠️ Tipo de ação desconhecido: ${approval.action_type}`);
          emailResult = { success: false, error: `Tipo de ação desconhecido: ${approval.action_type}` };
      }

      return {
        email_sent: emailResult.success && !emailResult.simulated,
        email_simulated: emailResult.simulated || false,
        email_id: emailResult.id,
        message: emailResult.message || (emailResult.success ? 'Ação executada' : emailResult.error)
      };

    } catch (error) {
      console.error('Action Execution Error:', error);
      return { email_sent: false, error: error.message };
    }
  }

  async getApprovalStats() {
    const db = await getDatabase();
    const stats = await db.all(`
      SELECT status, COUNT(*) as count 
      FROM approvals 
      GROUP BY status
    `);
    return stats.reduce((acc, stat) => { acc[stat.status] = stat.count; return acc; }, {});
  }

  async cleanupExpiredApprovals() {
    const db = await getDatabase();
    const result = await db.run(`
      UPDATE approvals SET status = 'expired' 
      WHERE status = 'pending' AND expires_at < datetime('now')
    `);
    if (result.changes > 0) console.log(`🧹 ${result.changes} aprovações expiradas atualizadas`);
    return result.changes;
  }
}

export default new ApprovalEngine();
