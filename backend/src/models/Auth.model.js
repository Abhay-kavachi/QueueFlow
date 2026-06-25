const { query } = require('../utils/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const AuditService = require('../services/Audit.service');

class AuthModel {
  static hashIdentifier(identifier) {
    return crypto.createHash('sha256').update(identifier.toString()).digest('hex');
  }

  static generateOTP(length = 6) {
    return Math.floor(Math.random() * Math.pow(10, length)).toString().padStart(length, '0');
  }

  static async storeOTP(userHash, otp, purpose) {
    const expiryMinutes = 5; // Enforced 5 minutes
    const expiryTime = new Date(Date.now() + expiryMinutes * 60000);
    const otpHash = await bcrypt.hash(otp, 10);
    
    const result = await query(
      `INSERT INTO otp_verifications (user_hash, otp_hash, purpose, expires_at, attempts, is_used) 
       VALUES ($1, $2, $3, $4, 0, false) 
       RETURNING id`,
      [userHash, otpHash, purpose, expiryTime]
    );
    return result.rows[0];
  }

  static async verifyOTP(userHash, otp, purpose) {
    // Check if the user is currently locked out
    const lockoutCheck = await query(
      `SELECT locked_until FROM otp_verifications 
       WHERE user_hash = $1 AND purpose = $2 
       ORDER BY created_at DESC LIMIT 1`,
      [userHash, purpose]
    );
    if (lockoutCheck.rows.length > 0 && lockoutCheck.rows[0].locked_until > new Date()) {
      return { valid: false, reason: 'Too many failed attempts. Try again later.' };
    }

    // We only fetch unexpired, unused OTPs
    const result = await query(
      `SELECT id, otp_hash, attempts, is_used, expires_at 
       FROM otp_verifications 
       WHERE user_hash = $1 AND purpose = $2 AND is_used = false AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userHash, purpose]
    );
    const verification = result.rows[0];
    if (!verification) {
      return { valid: false, reason: 'OTP not found, expired, or already used' };
    }

    if (verification.attempts >= 5) {
      // Apply 15-minute lockout
      const lockUntil = new Date(Date.now() + 15 * 60000);
      await query('UPDATE otp_verifications SET locked_until = $1 WHERE id = $2', [lockUntil, verification.id]);
      return { valid: false, reason: 'Maximum OTP attempts exceeded. Locked for 15 minutes.' };
    }

    // Increment attempts
    await query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1', [verification.id]);

    const isValid = await bcrypt.compare(otp, verification.otp_hash);
    if (!isValid) {
      // Check if we hit the limit on this attempt
      if (verification.attempts + 1 >= 5) {
        const lockUntil = new Date(Date.now() + 15 * 60000);
        await query('UPDATE otp_verifications SET locked_until = $1 WHERE id = $2', [lockUntil, verification.id]);
        return { valid: false, reason: 'Maximum OTP attempts exceeded. Locked for 15 minutes.' };
      }
      return { valid: false, reason: 'Invalid OTP' };
    }

    // Mark as used immediately to prevent replay
    await query('UPDATE otp_verifications SET is_used = true WHERE id = $1', [verification.id]);
    return { valid: true };
  }

  static async createUserSession(userHash, tenantId = null, roleId = 'USER', deviceName = 'Unknown') {
    const sessionId = crypto.randomUUID();
    const accessToken = jwt.sign(
      { user_id: userHash, tenant_id: tenantId, role_id: roleId, session_id: sessionId },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '15m' }
    );
    
    // Generate a secure random refresh token
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    
    const expiryTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await query(
      `INSERT INTO user_sessions (id, user_hash, organization_id, refresh_token_hash, is_active, device_name, expires_at) 
       VALUES ($1, $2, $3, $4, true, $5, $6)`,
      [sessionId, userHash, tenantId, refreshTokenHash, deviceName, expiryTime]
    );
    return { sessionToken: accessToken, refreshToken, sessionId };
  }

  static async verifySessionToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      
      // Verify the session hasn't been revoked
      const result = await query(
        `SELECT id, user_hash, organization_id, expires_at, is_active 
         FROM user_sessions 
         WHERE id = $1`,
        [decoded.session_id]
      );
      
      if (result.rows.length === 0 || !result.rows[0].is_active) {
        return { valid: false, reason: 'Session has been revoked or does not exist' };
      }
      
      // Update last seen
      await query('UPDATE user_sessions SET last_seen = NOW() WHERE id = $1', [decoded.session_id]);
      
      return { 
        valid: true, 
        userHash: decoded.user_id, 
        tenantId: decoded.tenant_id,
        roleId: decoded.role_id,
        sessionId: decoded.session_id 
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return { valid: false, reason: 'Access token expired' };
      }
      return { valid: false, reason: 'Invalid token' };
    }
  }
  
  static async revokeSession(sessionId) {
    await query('UPDATE user_sessions SET is_active = false WHERE id = $1', [sessionId]);
  }

  static async invalidateSession(sessionId) {
    await query(
      'DELETE FROM user_sessions WHERE id = $1',
      [sessionId]
    );
  }

  static async cleanupExpiredTokens() {
    await query('DELETE FROM user_sessions WHERE expires_at < NOW()');
    await query('DELETE FROM otp_verifications WHERE expires_at < NOW()');
  }

  static async authenticateAdmin(username, password) {
    const result = await query(
      'SELECT id, username, password_hash, role_id, is_active, organization_id, service_id FROM workers WHERE username = $1',
      [username]
    );
    const worker = result.rows[0];
    if (!worker || !worker.is_active) {
      // Dummy compare to mitigate timing attacks
      await bcrypt.compare(password, '$2b$10$NyyAWsVr6k5b9ylxryZBeOAOgEEEACiiPvCUGwi/r.qLaRHRyY8kO');
      return { success: false, reason: 'Invalid credentials' };
    }
    const isValidPassword = await bcrypt.compare(password, worker.password_hash);
    if (!isValidPassword) {
      return { success: false, reason: 'Invalid credentials' };
    }
    
    const sessionId = crypto.randomUUID();
    const token = jwt.sign(
      { 
        user_id: worker.id, 
        tenant_id: worker.organization_id, 
        role_id: worker.role_id, 
        session_id: sessionId,
        username: worker.username,
        serviceId: worker.service_id
      },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '8h' }
    );

    // Audit Log for staff login
    await AuditService.logEvent({
      tenantId: worker.organization_id,
      userId: worker.id,
      roleId: worker.role_id,
      action: 'LOGIN_SUCCESS',
      entityType: 'Worker',
      entityId: worker.id,
      metadata: { username: worker.username }
    });

    return { 
      success: true, 
      token,
      admin: { 
        id: worker.id, 
        username: worker.username, 
        role: worker.role_id,
        organizationId: worker.organization_id,
        serviceId: worker.service_id
      }
    };
  }

  static async verifyAdminToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      return { 
        valid: true, 
        admin: {
          id: decoded.user_id,
          username: decoded.username,
          role: decoded.role_id,
          organizationId: decoded.tenant_id,
          serviceId: decoded.serviceId,
          sessionId: decoded.session_id
        } 
      };
    } catch (error) {
      return { valid: false, reason: 'Invalid admin token' };
    }
  }

  static async isUserInQueue(userHash, serviceId) {
    const result = await query(
      `SELECT id, state FROM live_queue 
       WHERE user_hash = $1 AND service_id = $2 AND state IN ('pending', 'next', 'active', 'grace')`,
      [userHash, serviceId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async getUserActiveServices(userHash) {
    const result = await query(
      `SELECT service_id, state FROM live_queue 
       WHERE user_hash = $1 AND state IN ('pending', 'next', 'active')`,
      [userHash]
    );
    return result.rows;
  }
}

module.exports = AuthModel;