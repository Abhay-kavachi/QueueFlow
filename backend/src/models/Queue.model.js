const { query, transaction } = require('../utils/database');

/**
 * QueueModel handles all core logic for manipulating the state of the Queue.
 * 
 * RESOURCE LOCKING (`SELECT ... FOR UPDATE`):
 * To guarantee ACID properties and eliminate race conditions during high-concurrency Queue transitions,
 * explicit row-level locks are used.
 * 
 * Specifically, `FOR UPDATE` is applied when:
 * 1. Advancing a user from 'pending' to 'next' (callNextCurrent).
 * 2. Moving a user from 'next' to 'active' (moveQueueForward).
 * 3. Expiring grace periods (expireGracePeriod).
 * 
 * These locks guarantee that if two concurrent workers try to call the next patient,
 * the database will serialize the requests, and the second worker will block until the first finishes,
 * returning either the next patient or nothing if the queue became empty.
 */
class QueueModel {
  static async query(text, params) {
    return query(text, params);
  }
  static async getAllServices() {
    const result = await query(
      `SELECT s.id, s.name, s.description, s.is_active, s.organization_id, s.capacity, sc.is_paused 
       FROM services s 
       LEFT JOIN service_configurations sc ON s.id = sc.service_id 
       WHERE s.is_active = true ORDER BY s.name`
    );
    return result.rows;
  }
  static async getPublicOrganizations() {
    const result = await query(
      'SELECT id, name, type, auth_mode FROM organizations ORDER BY name'
    );
    return result.rows;
  }
  static async getServiceConfig(serviceId) {
    const result = await query(
      `SELECT sc.*, s.name as service_name 
       FROM service_configurations sc 
       JOIN services s ON sc.service_id = s.id 
       WHERE sc.service_id = $1`,
      [serviceId]
    );
    return result.rows[0];
  }
  static async addUserToQueue(userHash, serviceId, registrationSource, entryType = 'walk_in', appointmentTime = null) {
    let positionQuery = `(SELECT COALESCE(MAX(position), 0) + 1 FROM live_queue WHERE service_id = $2 AND state IN ('pending', 'next'))`;
    let state = 'pending';
    if (entryType === 'appointment') {
      positionQuery = 'NULL';
      state = 'appointment';
    }
    
    const result = await query(
      `INSERT INTO live_queue (user_hash, service_id, state, position, organization_id, entry_type, appointment_time) 
       VALUES ($1, $2, $3, 
         ${positionQuery},
         (SELECT organization_id FROM services WHERE id = $2),
         $4, $5) 
       RETURNING id, position`,
      [userHash, serviceId, state, entryType, appointmentTime]
    );
    return {
      queueEntry: result.rows[0],
      recordEntry: null
    };
  }
  static async getUserPosition(userHash, serviceId) {
    const result = await query(
      `SELECT id, position, state, created_at 
       FROM live_queue 
       WHERE user_hash = $1 AND service_id = $2 AND state != 'completed'`,
      [userHash, serviceId]
    );
    return result.rows[0];
  }
  static async getRelativeQueueView(userHash, serviceId) {
    const userPositionResult = await query(
      `SELECT position FROM live_queue 
       WHERE user_hash = $1 AND service_id = $2 AND state IN ('pending', 'next', 'active')`,
      [userHash, serviceId]
    );
    if (userPositionResult.rows.length === 0) {
      return { ahead: [], currentUser: null, behind: [], totalCount: 0 };
    }
    const userPosition = userPositionResult.rows[0].position;
    const aheadResult = await query(
      `SELECT position, created_at 
       FROM live_queue 
       WHERE service_id = $1 AND position < $2 AND state IN ('pending', 'next', 'active')
       ORDER BY position DESC 
       LIMIT 3`,
      [serviceId, userPosition]
    );
    const behindResult = await query(
      `SELECT position, created_at 
       FROM live_queue 
       WHERE service_id = $1 AND position > $2 AND state IN ('pending', 'next', 'active')
       ORDER BY position ASC 
       LIMIT 7`,
      [serviceId, userPosition]
    );
    const totalCountResult = await query(
      `SELECT COUNT(*) as total 
       FROM live_queue 
       WHERE service_id = $1 AND state IN ('pending', 'next', 'active')`,
      [serviceId]
    );
    return {
      ahead: aheadResult.rows.reverse(), 
      currentUser: { position: userPosition },
      behind: behindResult.rows,
      totalCount: parseInt(totalCountResult.rows[0].total)
    };
  }
  static async moveQueueForward(serviceId) {
    // Acquire a row-level lock on the specific 'next' user to prevent concurrent workers from activating the same user
    const result = await transaction([
      {
        text: `SELECT id, user_hash, position 
               FROM live_queue 
               WHERE service_id = $1 AND state = 'next' 
               ORDER BY position ASC 
               LIMIT 1 FOR UPDATE`,
        params: [serviceId]
      }
    ]);
    const nextPerson = result[0].rows[0];
    if (!nextPerson) return null;
    await query(
      `UPDATE live_queue 
       SET state = 'active', updated_at = NOW() 
       WHERE id = $1`,
      [nextPerson.id]
    );
    return nextPerson;
  }
  static async startGracePeriod(queueId) {
    const result = await query(
      `UPDATE live_queue 
       SET state = 'grace', grace_started_at = NOW(), updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [queueId]
    );
    return result.rows[0];
  }

  static async autoTransitionToGrace() {
    const result = await query(
      `UPDATE live_queue 
       SET state = 'grace', grace_started_at = NOW(), updated_at = NOW() 
       FROM service_configurations sc
       WHERE live_queue.service_id = sc.service_id 
         AND live_queue.state = 'next' 
         AND live_queue.updated_at < NOW() - INTERVAL '3 minutes'
         AND (sc.is_paused IS NULL OR sc.is_paused = false)
       RETURNING live_queue.id, live_queue.service_id, live_queue.user_hash`
    );
    return result.rows;
  }

  static async autoCallStagnantQueues() {
    // Find services that have pending users, NO active users, are NOT paused, 
    // and haven't had any queue activity (updated_at) in the last 3 minutes.
    const stagnantServicesRes = await query(
      `SELECT s.id as service_id
       FROM services s
       LEFT JOIN service_configurations sc ON s.id = sc.service_id
       WHERE s.is_active = true 
         AND (sc.is_paused IS NULL OR sc.is_paused = false)
         AND EXISTS (SELECT 1 FROM live_queue WHERE service_id = s.id AND state = 'pending')
         AND NOT EXISTS (SELECT 1 FROM live_queue WHERE service_id = s.id AND state = 'active')
         AND (
           SELECT COALESCE(MAX(updated_at), '1970-01-01'::timestamp) 
           FROM live_queue 
           WHERE service_id = s.id
         ) < NOW() - INTERVAL '3 minutes'`
    );
    
    const calledServices = [];
    for (const row of stagnantServicesRes.rows) {
      const nextPerson = await this.callNextCurrent(row.service_id);
      if (nextPerson) calledServices.push(row.service_id);
    }
    return calledServices;
  }

  static async recycleExpiredGraceEntries() {
    const expiredRes = await query(
      `SELECT l.id, l.service_id FROM live_queue l
       LEFT JOIN service_configurations sc ON l.service_id = sc.service_id
       WHERE l.state = 'grace' AND l.grace_started_at < NOW() - INTERVAL '15 minutes'
       AND (sc.is_paused IS NULL OR sc.is_paused = false)`
    );
    
    const recycled = [];
    for (const row of expiredRes.rows) {
      const result = await query(
        `UPDATE live_queue 
         SET state = 'pending',
             position = (SELECT COALESCE(MAX(position), 0) + 1 FROM live_queue WHERE service_id = $2 AND state IN ('pending', 'next')),
             grace_started_at = NULL,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, service_id, position`,
        [row.id, row.service_id]
      );
      if (result.rows.length > 0) recycled.push(result.rows[0]);
    }
    return recycled;
  }

  static async reinstateFromGrace(queueId) {
    const result = await query(
      `UPDATE live_queue 
       SET state = 'active', grace_started_at = NULL, updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [queueId]
    );
    return result.rows[0];
  }

  static async sendToBack(queueId) {
    const svcRes = await query('SELECT service_id FROM live_queue WHERE id = $1', [queueId]);
    if (svcRes.rows.length === 0) return null;
    const serviceId = svcRes.rows[0].service_id;

    const result = await query(
      `UPDATE live_queue 
       SET state = 'pending',
           position = (SELECT COALESCE(MAX(position), 0) + 1 FROM live_queue WHERE service_id = $2 AND state IN ('pending', 'next')),
           grace_started_at = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [queueId, serviceId]
    );
    return result.rows[0];
  }
  static async completeService(queueId, actualWaitDuration) {
    const result = await transaction([
      {
        text: `INSERT INTO historical_queue_logs (user_hash, service_id, entry_type, appointment_time, grace_started_at, registration_source, final_status, actual_wait_duration, completed_at)
               SELECT user_hash, service_id, entry_type, appointment_time, grace_started_at, 'self', 'completed', $2, NOW()
               FROM live_queue WHERE id = $1
               RETURNING id`,
        params: [queueId, actualWaitDuration]
      },
      {
        text: `DELETE FROM live_queue WHERE id = $1 RETURNING id`,
        params: [queueId]
      }
    ]);
    return {
      queueRemoved: result[1].rowCount > 0,
      recordUpdated: result[0].rowCount > 0
    };
  }
  static async completeServiceCurrent(serviceId) {
    const activeResult = await query(
      `SELECT id, created_at FROM live_queue WHERE service_id = $1 AND state = 'active' LIMIT 1`,
      [serviceId]
    );
    if(activeResult.rows.length === 0) return null;
    const active = activeResult.rows[0];
    const waitTime = Math.floor((Date.now() - new Date(active.created_at).getTime()) / 60000);
    
    await this.completeService(active.id, waitTime);
    return active;
  }
  static async setNoShowCurrent(serviceId) {
    const activeResult = await query(
      `SELECT id FROM live_queue WHERE service_id = $1 AND state = 'active' LIMIT 1`,
      [serviceId]
    );
    if(activeResult.rows.length === 0) return null;
    return await this.startGracePeriod(activeResult.rows[0].id);
  }
  static async callNextCurrent(serviceId) {
    // Acquire a row-level lock on the top 'pending' user to ensure only one worker can call them forward
    const result = await transaction([
      {
        text: `SELECT id FROM live_queue WHERE service_id = $1 AND state = 'pending' ORDER BY position ASC LIMIT 1 FOR UPDATE`,
        params: [serviceId]
      }
    ]);
    if(result[0].rows.length === 0) return null;
    const nextPerson = result[0].rows[0];
    await query(
      `UPDATE live_queue SET state = 'next', updated_at = NOW() WHERE id = $1`,
      [nextPerson.id]
    );
    await query(
      `UPDATE live_queue SET position = position - 1 WHERE service_id = $1 AND state = 'pending' AND position > 0`,
      [serviceId]
    );
    return nextPerson;
  }
  
  static async markPatientActive(serviceId) {
    const nextResult = await query(
      `SELECT id FROM live_queue WHERE service_id = $1 AND state = 'next' ORDER BY updated_at ASC LIMIT 1`,
      [serviceId]
    );
    if(nextResult.rows.length === 0) return null;
    const nextPerson = nextResult.rows[0];
    await query(
      `UPDATE live_queue SET state = 'active', updated_at = NOW() WHERE id = $1`,
      [nextPerson.id]
    );
    return nextPerson;
  }
  static async expireGracePeriod(queueId) {
    const result = await transaction([
      {
        text: `INSERT INTO historical_queue_logs (user_hash, service_id, entry_type, appointment_time, grace_started_at, registration_source, final_status, completed_at)
               SELECT user_hash, service_id, entry_type, appointment_time, grace_started_at, 'self', 'expired', NOW()
               FROM live_queue WHERE id = $1
               RETURNING id`,
        params: [queueId]
      },
      {
        text: `DELETE FROM live_queue WHERE id = $1 RETURNING id`,
        params: [queueId]
      }
    ]);
    return {
      queueRemoved: result[1].rowCount > 0,
      recordUpdated: result[0].rowCount > 0
    };
  }

  static async removeUserFromQueue(queueId) {
    const result = await transaction([
      {
        text: `INSERT INTO historical_queue_logs (user_hash, service_id, entry_type, appointment_time, grace_started_at, registration_source, final_status, completed_at)
               SELECT user_hash, service_id, entry_type, appointment_time, grace_started_at, 'admin', 'cancelled', NOW()
               FROM live_queue WHERE id = $1
               RETURNING id`,
        params: [queueId]
      },
      {
        text: `DELETE FROM live_queue WHERE id = $1 RETURNING id, service_id, state`,
        params: [queueId]
      }
    ]);

    if (result[1].rowCount > 0) {
      const deletedEntry = result[1].rows[0];
      if (deletedEntry.state === 'pending') {
        await query(
          `WITH numbered AS (
             SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC) as new_pos
             FROM live_queue 
             WHERE service_id = $1 AND state = 'pending'
           )
           UPDATE live_queue l
           SET position = n.new_pos
           FROM numbered n
           WHERE l.id = n.id AND l.position != n.new_pos`,
          [deletedEntry.service_id]
        );
      }
    }

    return {
      success: result[1].rowCount > 0,
      removed: result[1].rows[0]
    };
  }

  static async getCurrentQueueStatus(serviceId) {
    const result = await query(
      `SELECT 
         COUNT(*) FILTER (WHERE state = 'pending') as pending_count,
         COUNT(*) FILTER (WHERE state = 'next') as next_count,
         COUNT(*) FILTER (WHERE state = 'active') as active_count,
         COUNT(*) FILTER (WHERE state = 'grace') as grace_count,
         MIN(position) FILTER (WHERE state = 'pending') as next_available_position
       FROM live_queue 
       WHERE service_id = $1`,
      [serviceId]
    );
    return result.rows[0];
  }
  static async setServicePaused(serviceId, isPaused) {
    const result = await query(
      `UPDATE service_configurations 
       SET is_paused = $1, updated_at = NOW() 
       WHERE service_id = $2 
       RETURNING *`,
      [isPaused, serviceId]
    );
    return result.rows[0];
  }
  static async batchSkipUsers(serviceId, count) {
    const result = await query(
      `WITH skipped AS (
         SELECT id, user_hash
         FROM live_queue 
         WHERE service_id = $1 AND state = 'pending'
         ORDER BY position ASC
         LIMIT $2
       )
       UPDATE live_queue 
       SET state = 'skipped', updated_at = NOW()
       WHERE id IN (SELECT id FROM skipped)
       RETURNING *`,
      [serviceId, count]
    );
    return result.rows;
  }

  static async getAvailableSlots(serviceId, dateStr) {
    
    const slots = [];
    const baseDate = dateStr ? new Date(dateStr) : new Date();
    
    const yyyy = baseDate.getFullYear();
    const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
    const dd = String(baseDate.getDate()).padStart(2, '0');
    
    for (let h = 9; h < 17; h++) {
      for (let m of [0, 30]) {
        const hh = String(h).padStart(2, '0');
        const min = String(m).padStart(2, '0');
        slots.push(`${yyyy}-${mm}-${dd}T${hh}:${min}:00.000`);
      }
    }
    
    
    const svcRes = await query('SELECT capacity FROM services WHERE id = $1', [serviceId]);
    const capacity = svcRes.rows[0]?.capacity || 1;

    
    const existing = await query(
      `SELECT appointment_time, COUNT(*) as count 
       FROM live_queue 
       WHERE service_id = $1 AND entry_type = 'appointment' AND DATE(appointment_time) = $2
       GROUP BY appointment_time`,
      [serviceId, `${yyyy}-${mm}-${dd}`]
    );
    
    const countMap = {};
    existing.rows.forEach(r => {
      
      const d = new Date(r.appointment_time);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00.000`;
      countMap[k] = parseInt(r.count);
    });

    
    const now = new Date();
    
    return slots.map(timeStr => {
      const slotTime = new Date(timeStr);
      const isPast = slotTime < now;
      const booked = countMap[timeStr] || 0;
      return {
        time: timeStr,
        available: !isPast && (booked < capacity)
      };
    });
  }

  static async getUserActiveQueues(userHash) {
    const result = await query(
      `SELECT lq.id, lq.position, lq.state, lq.entry_type, lq.appointment_time, lq.service_id, 
              s.name as service_name, o.name as org_name
       FROM live_queue lq
       JOIN services s ON lq.service_id = s.id
       JOIN organizations o ON lq.organization_id = o.id
       WHERE lq.user_hash = $1 AND lq.state NOT IN ('completed', 'expired')
       ORDER BY lq.created_at DESC`,
      [userHash]
    );
    return result.rows.map(r => ({
      id: r.id,
      queue_position: r.position,
      state: r.state,
      entry_type: r.entry_type,
      appointment_time: r.appointment_time,
      service_name: r.service_name,
      org_name: r.org_name,
      service_id: r.service_id
    }));
  }
}
module.exports = QueueModel;