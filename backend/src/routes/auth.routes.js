const express = require('express');
const router = express.Router();
const AuthService = require('../services/Auth.service');
const { rateLimit } = require('../middleware/auth.middleware');
const { query } = require('../utils/database');
const bcrypt = require('bcryptjs');
router.post('/request-otp', rateLimit(5, 15 * 60 * 1000), async (req, res, next) => {
  try {
    const { identifier, purpose } = req.body;
    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: 'Identifier required'
      });
    }
    const result = await AuthService.requestOTP(identifier, purpose);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json({
      success: true,
      message: result.message,
      userHash: result.userHash
    });
  } catch (error) {
    next(error);
  }
});
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { userHash, otp, purpose } = req.body;
    if (!userHash || !otp) {
      return res.status(400).json({
        success: false,
        error: 'User hash and OTP required'
      });
    }
    const result = await AuthService.verifyOTPAndLogin(userHash, otp, purpose);
    if (!result.success) {
      return res.status(401).json(result);
    }
    res.json({
      success: true,
      message: result.message,
      sessionToken: result.sessionToken
    });
  } catch (error) {
    next(error);
  }
});
router.post('/worker-verify', async (req, res, next) => {
  try {
    const { identifier, workerToken } = req.body;
    if (!identifier || !workerToken) {
      return res.status(400).json({
        success: false,
        error: 'Identifier and worker token required'
      });
    }
    const result = await AuthService.workerVerifyUser(identifier, workerToken);
    if (!result.success) {
      return res.status(401).json(result);
    }
    res.json({
      success: true,
      message: result.message,
      sessionToken: result.sessionToken,
      userHash: result.userHash
    });
  } catch (error) {
    next(error);
  }
});
router.post('/logout', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(400).json({
        success: false,
        error: 'Session token required'
      });
    }
    const token = authHeader.substring(7);
    const verificationResult = await AuthService.verifySession(token);
    if (!verificationResult.valid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid session'
      });
    }
    const result = await AuthService.logout(verificationResult.sessionId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
router.post('/staff/login', rateLimit(10, 15 * 60 * 1000), async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password required'
      });
    }
    const result = await AuthService.adminLogin(username, password);
    if (!result.success) {
      return res.status(401).json(result);
    }
    res.json({
      success: true,
      message: 'Staff login successful',
      token: result.token,
      admin: result.admin
    });
  } catch (error) {
    next(error);
  }
});
router.get('/verify-session', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        valid: false,
        error: 'No session token provided'
      });
    }
    const token = authHeader.substring(7);
    const result = await AuthService.verifySession(token);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Authentication Service',
    timestamp: new Date().toISOString()
  });
});

router.post('/staff/claim-admin', async (req, res, next) => {
  try {
    const { adminInviteKey, username, password } = req.body;
    if (!adminInviteKey || !username || !password) {
      return res.status(400).json({ error: 'Invite key, username, and password required' });
    }

    
    const orgRes = await query('SELECT id FROM organizations WHERE admin_invite_key = $1', [adminInviteKey]);
    if (orgRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid admin invite key' });
    }
    const orgId = orgRes.rows[0].id;

    
    const adminCheck = await query('SELECT id FROM workers WHERE organization_id = $1 AND role = $2', [orgId, 'admin']);
    if (adminCheck.rows.length > 0) {
      return res.status(400).json({ error: 'This organization already has an administrator.' });
    }

    
    const hash = await bcrypt.hash(password, 10);
    
    const svcRes = await query('SELECT id FROM services WHERE organization_id = $1 ORDER BY id ASC LIMIT 1', [orgId]);
    const serviceId = svcRes.rows.length > 0 ? svcRes.rows[0].id : null;

    await query(
      "INSERT INTO workers (organization_id, service_id, name, username, password_hash, role) VALUES ($1, $2, $3, $4, $5, $6)",
      [orgId, serviceId, 'Org Administrator', username, hash, 'admin']
    );

    
    
    
    res.json({ success: true, message: 'Admin account claimed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to claim admin account' });
  }
});


router.post('/staff/register-worker', async (req, res, next) => {
  try {
    const { workerInviteKey, username, password } = req.body;
    if (!workerInviteKey || !username || !password) {
      return res.status(400).json({ error: 'Invite key, username, and password required' });
    }

    
    const orgRes = await query('SELECT id FROM organizations WHERE worker_invite_key = $1', [workerInviteKey]);
    if (orgRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid worker invite key' });
    }
    const orgId = orgRes.rows[0].id;

    const hash = await bcrypt.hash(password, 10);
    
    const svcRes = await query('SELECT id FROM services WHERE organization_id = $1 ORDER BY id ASC LIMIT 1', [orgId]);
    const serviceId = svcRes.rows.length > 0 ? svcRes.rows[0].id : null;

    await query(
      "INSERT INTO workers (organization_id, service_id, name, username, password_hash, role) VALUES ($1, $2, $3, $4, $5, $6)",
      [orgId, serviceId, 'Staff Worker', username, hash, 'worker']
    );
    
    res.json({ success: true, message: 'Worker account created successfully' });
  } catch (error) {
    if (error.constraint === 'workers_username_key') {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    console.error(error);
    res.status(500).json({ error: 'Failed to create worker account' });
  }
});

module.exports = router;