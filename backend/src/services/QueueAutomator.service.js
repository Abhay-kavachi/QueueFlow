const QueueModel = require('../models/Queue.model');

class QueueAutomator {
  constructor(io) {
    this.io = io;
    this.intervalId = null;
  }

  start() {
    if (this.intervalId) return;
    
    
    this.intervalId = setInterval(async () => {
      try {
        await this.runLoop();
      } catch (err) {
        console.error('[QueueAutomator] Error in cron loop:', err);
      }
    }, 30000);
    
    console.log('[QueueAutomator] Started running every 30 seconds.');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async runLoop() {
    const affectedServices = new Set();

    
    const graced = await QueueModel.autoTransitionToGrace();
    for (const entry of graced) {
      affectedServices.add(entry.service_id);
    }

    
    const recycled = await QueueModel.recycleExpiredGraceEntries();
    for (const entry of recycled) {
      affectedServices.add(entry.service_id);
    }

    // Auto-call next person if the queue has been empty/stagnant for 3 minutes
    const autoCalled = await QueueModel.autoCallStagnantQueues();
    for (const serviceId of autoCalled) {
      affectedServices.add(serviceId);
    }

    // Auto-advance the queue for any service that had an active user removed (moved to grace)
    if (graced && graced.length > 0) {
      for (const entry of graced) {
        await QueueModel.callNextCurrent(entry.service_id);
      }
    }

    
    if (affectedServices.size > 0 && this.io) {
      for (const serviceId of affectedServices) {
        this.io.to(`service_${serviceId}`).emit('queue_updated', {
          type: 'automated_state_change'
        });
      }
    }
  }
}

module.exports = QueueAutomator;
