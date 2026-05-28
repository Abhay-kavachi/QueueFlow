const QueueModel = require('./queue.model');
const QueueEngine = require('./queue.engine');

class QueueService {
    static async moveQueue(orgId, serviceId) {
    const capacity = await QueueModel.getServiceCapacity(orgId, serviceId);
    const activeCount = await QueueModel.countActiveUsers(orgId, serviceId);
    
    
    const availableSlots = capacity - activeCount;

    if (availableSlots <= 0) return;

    const nextUsers = await QueueModel.getNextPendingUsers(orgId, serviceId, availableSlots);

    
    const room = `${orgId}_${serviceId}`;

    for (const user of nextUsers) {
      await QueueModel.markAsActive(user.id);
      
      
      await QueueEngine.startGraceTimer(user.id, orgId, serviceId);
      
      if (QueueEngine.socketEmitter) {
         QueueEngine.socketEmitter.to(room).emit('queue:update', { action: 'active', userHash: user.user_hash });
      }
    }
  }

    static async handleNext(workerId, orgId, serviceId) {
    
    const worker = await QueueModel.getWorkerCheck(workerId);
    if (!worker || worker.organization_id !== orgId || worker.service_id !== serviceId) {
       throw new Error("Unauthorized: Worker does not own this queue context");
    }

    await QueueModel.completeCurrentActive(workerId, orgId, serviceId);
    await this.moveQueue(orgId, serviceId);
  }

    static async handleGraceExpiry(tokenId) {
    const context = await QueueModel.getTokenContext(tokenId);
    if (!context) return; 

    await QueueModel.markExpired(tokenId);
    
    const { organization_id, service_id } = context;
    const room = `${organization_id}_${service_id}`;
    
    if (QueueEngine.socketEmitter) {
       QueueEngine.socketEmitter.to(room).emit('queue:update', { action: 'expired', userHash: context.user_hash });
    }

    
    await this.moveQueue(organization_id, service_id);
  }
}

module.exports = QueueService;
