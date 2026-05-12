import { getDatabase } from '../db.js';

export async function logAudit(userId, action, resourceType, resourceId, oldValue = null, newValue = null, req = null) {
  const db = await getDatabase();

  try {
    await db.run(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_value, new_value, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        action,
        resourceType,
        resourceId,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        req?.ip || 'unknown',
        req?.get('user-agent') || 'unknown'
      ]
    );
  } catch (error) {
    console.error('Audit logging error:', error);
  }
}

export async function getAuditLogs(filters = {}) {
  const db = await getDatabase();

  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (filters.userId) {
    query += ' AND user_id = ?';
    params.push(filters.userId);
  }

  if (filters.resourceType) {
    query += ' AND resource_type = ?';
    params.push(filters.resourceType);
  }

  if (filters.action) {
    query += ' AND action = ?';
    params.push(filters.action);
  }

  if (filters.startDate) {
    query += ' AND created_at >= ?';
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    query += ' AND created_at <= ?';
    params.push(filters.endDate);
  }

  query += ' ORDER BY created_at DESC LIMIT 100';

  return await db.all(query, params);
}
