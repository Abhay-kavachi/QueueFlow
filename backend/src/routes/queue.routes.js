const express = require('express');
const router = express.Router();
const QueueModel = require('../models/Queue.model');
const AuthService = require('../services/Auth.service');
const AuthModel = require('../models/Auth.model');
const MLService = require('../services/ML.service');
const AuditService = require('../services/Audit.service');
const { authenticateUser, authenticateWorker } = require('../middleware/auth.middleware');
router.get('/organizations', async (req, res, next) => {
  try {
    const orgs = await QueueModel.getPublicOrganizations();
    res.json({
      success: true,
      data: orgs
    });
  } catch (error) {
    next(error);
  }
});
router.get('/services', async (req, res, next) => {
  try {
    const services = await QueueModel.getAllServices();
    res.json({
      success: true,
      data: services
    });
  } catch (error) {
    next(error);
  }
});

router.get('/services/:serviceId/display', async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    
    const activeRes = await QueueModel.query(
      `SELECT id, position, state, user_hash FROM live_queue 
       WHERE service_id = $1 AND state = 'active'
       LIMIT 1`,
      [serviceId]
    );
    
    const nextRes = await QueueModel.query(
      `SELECT id, position, state, user_hash FROM live_queue 
       WHERE service_id = $1 AND state IN ('pending', 'next')
       ORDER BY position ASC
       LIMIT 5`,
      [serviceId]
    );

    const serviceRes = await QueueModel.query(
      `SELECT name FROM services WHERE id = $1`,
      [serviceId]
    );

    res.json({
      success: true,
      active: activeRes.rows[0] || null,
      next: nextRes.rows || [],
      serviceName: serviceRes.rows[0]?.name || `Service #${serviceId}`
    });
  } catch (error) {
    next(error);
  }
});

router.get('/slots/:serviceId', authenticateUser, async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const date = req.query.date; 
    const slots = await QueueModel.getAvailableSlots(serviceId, date);
    res.json({ success: true, slots });
  } catch (error) {
    next(error);
  }
});

router.get('/my-status', authenticateUser, async (req, res, next) => {
  try {
    const userHash = req.user.userHash;
    const queues = await QueueModel.getUserActiveQueues(userHash);
    
    // Attach ETA to each active queue
    const queuesWithETA = await Promise.all(queues.map(async (q) => {
      const avgWait = await MLService.getPredictedWaitTime(q.service_id);
      return {
        ...q,
        eta_minutes: Math.round(q.queue_position * avgWait)
      };
    }));

    res.json({ success: true, queues: queuesWithETA });
  } catch (error) {
    next(error);
  }
});
router.get('/position/:serviceId', authenticateUser, async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const userHash = req.user.userHash;
    const position = await QueueModel.getUserPosition(userHash, serviceId);
    if (!position) {
      return res.status(404).json({
        success: false,
        error: 'User not found in queue'
      });
    }
    
    const avgWait = await MLService.getPredictedWaitTime(serviceId);
    position.eta_minutes = Math.round(position.position * avgWait);

    res.json({
      success: true,
      data: position
    });
  } catch (error) {
    next(error);
  }
});
router.get('/view/:serviceId', authenticateUser, async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const userHash = req.user.userHash;
    const queueView = await QueueModel.getRelativeQueueView(userHash, serviceId);
    res.json({
      success: true,
      data: queueView
    });
  } catch (error) {
    next(error);
  }
});
router.post('/join/:serviceId', authenticateUser, async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const userHash = req.user.userHash;
    const { type, time } = req.body;
    
    const services = await QueueModel.getAllServices();
    const service = services.find(s => s.id == serviceId);
    if (!service) {
      return res.status(404).json({ success: false, error: 'Service not found' });
    }

    const existingQueueEntry = await AuthModel.isUserInQueue(userHash, serviceId);
    if (existingQueueEntry) {
      return res.status(400).json({
        success: false,
        error: `You are already ${existingQueueEntry.state} in this queue`
      });
    }

    if (type === 'appointment') {
      if (!time) return res.status(400).json({ success: false, error: 'Appointment time is required' });
      
      const { query } = require('../utils/database');
      
      
      await query('BEGIN');
      try {
        const capacity = service.capacity || 1;
        
        
        const existingCountRes = await query(
          `SELECT COUNT(*) as count FROM live_queue 
           WHERE service_id = $1 AND entry_type = 'appointment' AND appointment_time = $2`,
          [serviceId, time]
        );
        
        if (parseInt(existingCountRes.rows[0].count) >= capacity) {
          await query('ROLLBACK');
          return res.status(400).json({ success: false, error: 'Slot is no longer available' });
        }
        
        const result = await QueueModel.addUserToQueue(userHash, serviceId, 'self', 'appointment', time);
        await query('COMMIT');
        
        const avgWait = await MLService.getPredictedWaitTime(serviceId);
        const etaMinutes = avgWait;

        await AuditService.logEvent({
          tenantId: service.organization_id,
          userId: userHash,
          action: 'QUEUE_JOINED',
          entityType: 'Queue',
          entityId: result.queueEntry.id,
          correlationId: req.correlationId,
          metadata: { entryType: 'appointment', appointmentTime: time }
        });

        return res.status(201).json({
          success: true,
          message: 'Appointment booked successfully',
          data: { queueId: result.queueEntry.id, position: null, appointmentTime: time, eta_minutes: etaMinutes }
        });
      } catch (err) {
        await query('ROLLBACK');
        throw err;
      }
    } else {
      
      const result = await QueueModel.addUserToQueue(userHash, serviceId, 'self', 'walk_in', null);
      
      const avgWait = await MLService.getPredictedWaitTime(serviceId);
      const etaMinutes = Math.round(result.queueEntry.position * avgWait);

      await AuditService.logEvent({
        tenantId: service.organization_id,
        userId: userHash,
        action: 'QUEUE_JOINED',
        entityType: 'Queue',
        entityId: result.queueEntry.id,
        correlationId: req.correlationId,
        metadata: { entryType: 'walk_in', position: result.queueEntry.position }
      });

      return res.status(201).json({
        success: true,
        message: 'Successfully joined queue',
        data: { queueId: result.queueEntry.id, position: result.queueEntry.position, eta_minutes: etaMinutes }
      });
    }
  } catch (error) {
    next(error);
  }
});
router.post('/join/:serviceId/worker', authenticateWorker, async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const { identifier } = req.body; 
    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: 'Identifier required'
      });
    }
    const userHash = AuthService.hashIdentifier(identifier);
    const services = await QueueModel.getAllServices();
    const service = services.find(s => s.id == serviceId);
    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }
    const result = await QueueModel.addUserToQueue(userHash, serviceId, 'worker');
    
    await AuditService.logEvent({
      tenantId: service.organization_id,
      userId: req.worker.id,
      roleId: req.roleId,
      action: 'QUEUE_JOINED',
      entityType: 'Queue',
      entityId: result.queueEntry.id,
      correlationId: req.correlationId,
      metadata: { entryType: 'walk_in', position: result.queueEntry.position, onBehalfOf: userHash }
    });

    const avgWait = await MLService.getPredictedWaitTime(serviceId);
    const etaMinutes = Math.round(result.queueEntry.position * avgWait);

    res.status(201).json({
      success: true,
      message: 'User added to queue by worker',
      data: {
        queueId: result.queueEntry.id,
        position: result.queueEntry.position,
        eta_minutes: etaMinutes
      }
    });
  } catch (error) {
    next(error);
  }
});
router.get('/status/:serviceId', async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const status = await QueueModel.getCurrentQueueStatus(serviceId);
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    next(error);
  }
});
router.post('/undo-expiration/:queueId', authenticateUser, async (req, res, next) => {
  try {
    const { queueId } = req.params;
    const userHash = req.user.userHash;
    const queueEntry = await QueueModel.query(
      'SELECT id, grace_started_at FROM live_queue WHERE id = $1 AND user_hash = $2',
      [queueId, userHash]
    );
    if (queueEntry.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Queue entry not found or unauthorized'
      });
    }
    const entry = queueEntry.rows[0];
    const config = await QueueModel.getServiceConfig(
      (await QueueModel.query('SELECT service_id FROM live_queue WHERE id = $1', [queueId])).rows[0].service_id
    );
    const graceEndTime = new Date(entry.grace_started_at.getTime() + (config.grace_period_seconds * 1000));
    const undoDeadline = new Date(graceEndTime.getTime() + (parseInt(process.env.UNDO_WINDOW_SECONDS) * 1000));
    if (new Date() > undoDeadline) {
      return res.status(400).json({
        success: false,
        error: 'Undo window expired'
      });
    }
    await QueueModel.query(
      `UPDATE live_queue 
       SET state = 'grace', grace_started_at = NOW(), updated_at = NOW() 
       WHERE id = $1`,
      [queueId]
    );
    res.json({
      success: true,
      message: 'Grace period reset successfully'
    });
  } catch (error) {
    next(error);
  }
});
module.exports = router;