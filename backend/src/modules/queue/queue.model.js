const { query, transaction } = require('../../utils/database');

class QueueModel {
  static async getServiceCapacity(orgId, serviceId) {
    const res = await query(
      `SELECT capacity FROM services WHERE id = $1 AND organization_id = $2`,
      [serviceId, orgId]
    );
    return res.rows[0] ? res.rows[0].capacity : 1;
  }

  static async countActiveUsers(orgId, serviceId) {
    const res = await query(
      `SELECT count(*) FROM live_queue 
       WHERE organization_id = $1 AND service_id = $2 AND state IN ('active', 'grace')`,
      [orgId, serviceId]
    );
    return parseInt(res.rows[0].count);
  }

  static async getNextPendingUsers(orgId, serviceId, limit) {
    const res = await query(
      `SELECT id, user_hash FROM live_queue 
       WHERE organization_id = $1 AND service_id = $2 AND state = 'pending' 
       ORDER BY position ASC LIMIT $3`,
      [orgId, serviceId, limit]
    );
    return res.rows;
  }

  static async markAsActive(queueId) {
    await query(
      `UPDATE live_queue SET state = 'active', updated_at = NOW() WHERE id = $1`,
      [queueId]
    );
  }

  static async getTokenContext(tokenId) {
    const res = await query(
      `SELECT organization_id, service_id, user_hash, state FROM live_queue WHERE id = $1`,
      [tokenId]
    );
    return res.rows[0];
  }

  static async markExpired(tokenId) {
    return await transaction([
      {
        text: `UPDATE queue_records 
               SET final_status = 'expired', completed_at = NOW() 
               WHERE user_hash = (SELECT user_hash FROM live_queue WHERE id = $1)
               AND service_id = (SELECT service_id FROM live_queue WHERE id = $1) 
               AND organization_id = (SELECT organization_id FROM live_queue WHERE id = $1)
               AND final_status = 'pending'`,
        params: [tokenId]
      },
      {
        text: `DELETE FROM live_queue WHERE id = $1`,
        params: [tokenId]
      }
    ]);
  }

  static async completeCurrentActive(workerId, orgId, serviceId) {
     
     const queueUser = await query(`SELECT id FROM live_queue WHERE organization_id = $1 AND service_id = $2 AND state IN ('active', 'grace') ORDER BY updated_at ASC LIMIT 1`, [orgId, serviceId]);
     if (queueUser.rows.length === 0) return null;
     const tokenId = queueUser.rows[0].id;

     return await transaction([
       {
         text: `UPDATE queue_records SET final_status = 'completed', completed_at = NOW(), worker_id = $2 
                WHERE user_hash = (SELECT user_hash FROM live_queue WHERE id = $1)
                AND organization_id = $3 AND service_id = $4 AND final_status = 'pending'`,
         params: [tokenId, workerId, orgId, serviceId]
       },
       {
         text: `DELETE FROM live_queue WHERE id = $1`,
         params: [tokenId]
       }
     ]);
  }

  static async getWorkerCheck(workerId) {
     const res = await query(`SELECT organization_id, service_id FROM workers WHERE id = $1`, [workerId]);
     return res.rows[0] ? res.rows[0] : null;
  }
}

module.exports = QueueModel;
