require('dotenv').config();
const { query } = require('./src/utils/database');
const QueueModel = require('./src/models/Queue.model');
const AuthModel = require('./src/models/Auth.model');
const MLService = require('./src/services/ml.service');

async function testJoin() {
  const serviceId = 1;
  const userHash = 'someUserHash123';
  const type = 'appointment';
  const time = '2026-05-30T10:00:00.000';

  try {
    const services = await QueueModel.getAllServices();
    const service = services.find(s => s.id == serviceId);
    if (!service) throw new Error('Service not found');

    const existingQueueEntry = await AuthModel.isUserInQueue(userHash, serviceId);
    if (existingQueueEntry) throw new Error('Already in queue');

    await query('BEGIN');
    const capacity = service.capacity || 1;
    
    const existingCountRes = await query(
      `SELECT COUNT(*) as count FROM live_queue 
       WHERE service_id = $1 AND entry_type = 'appointment' AND appointment_time = $2
       FOR UPDATE`,
      [serviceId, time]
    );
    
    if (parseInt(existingCountRes.rows[0].count) >= capacity) {
      await query('ROLLBACK');
      throw new Error('Slot is no longer available');
    }
    
    console.log('Adding to queue...');
    const result = await QueueModel.addUserToQueue(userHash, serviceId, 'self', 'appointment', time);
    console.log('Added, result:', result);
    await query('COMMIT');
    
    const avgWait = await MLService.getPredictedWaitTime(serviceId);
    const etaMinutes = Math.round(result.queueEntry.position * avgWait);
    console.log('Success:', etaMinutes);
  } catch (err) {
    console.error('Error:', err);
    await query('ROLLBACK').catch(() => {});
  } finally {
    process.exit();
  }
}
testJoin();
