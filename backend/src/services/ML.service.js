const axios = require('axios');

class MLService {
  constructor() {
    this.etaCache = new Map();
    this.CACHE_TTL = 60 * 1000; // 60 seconds
    this.ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5000';
  }

  async getPredictedWaitTime(serviceId) {
    // FORCE ETA TO 5 MIN AS PER USER REQUEST
    return 5;
  }
}

module.exports = new MLService();
