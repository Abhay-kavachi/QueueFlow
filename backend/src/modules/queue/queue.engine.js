const { Worker, Queue } = require('bullmq');

const redisOptions = {
    host: process.env.REDIS_URL ? new URL(process.env.REDIS_URL).hostname : 'localhost',
    port: process.env.REDIS_URL ? parseInt(new URL(process.env.REDIS_URL).port) : 6379,
};


const QUEUE_NAME = 'queueflow-global-engine';
const globalQueue = new Queue(QUEUE_NAME, { connection: redisOptions });

class QueueEngine {
    static socketEmitter = null;

    static setSocketEmitter(io) {
        this.socketEmitter = io;
    }

    static async startGraceTimer(tokenId, orgId, serviceId) {
        const GRACE_PERIOD = 300000; 
        
        await globalQueue.add('EXPIRE_GRACE', { tokenId }, {
            delay: GRACE_PERIOD,
            jobId: `grace-${tokenId}` 
        });

        
        const room = `${orgId}_${serviceId}`;
        if (this.socketEmitter) {
            this.socketEmitter.to(room).emit('queue:update', { action: 'grace_started', tokenId });
        }
    }

    static async initializeWorker() {
        console.log("✅ Starting Universal Queue Worker Engine...");
        
        const QueueService = require('./queue.service');
        
        const worker = new Worker(QUEUE_NAME, async (job) => {
            const { tokenId } = job.data;
            if (job.name === 'EXPIRE_GRACE') {
                return await QueueService.handleGraceExpiry(tokenId);
            }
        }, { connection: redisOptions, concurrency: 50 });

        worker.on('failed', (job, err) => {
            console.error(`❌ Background Job Failed ${job.id}:`, err);
        });
    }
}

module.exports = QueueEngine;
