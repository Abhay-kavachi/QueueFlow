const { query } = require('../utils/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
class AuthModel {
  static hashIdentifier(identifier) {
    return crypto.createHash('sha256').update(identifier.toString()).digest('hex');
  }
  static generateOTP(length = 6) {
    if (process.env.DEMO_MODE === 'true') {
      return process.env.DEMO_OTP || '123456';
    }
    return Math.floor(Math.random() * Math.pow(10, length)).toString().padStart(length, '0');
  }
  static async storeOTP(userHash, otp, purpose) {
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 5;
    const expiryTime = new Date(Date.now() + expiryMinutes * 60000);
    const result = await query(
      `INSERT INTO otp_verifications (user_hash, otp_code, purpose, expires_at) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id`,
      [userHash, otp, purpose, expiryTime]
    );
    return result.rows[0];
  }
  static async verifyOTP(userHash, otp, purpose) {
    const result = await query(
      `SELECT id, is_used, expires_at 
       FROM otp_verifications 
       WHERE user_hash = $1 AND otp_code = $2 AND purpose = $3 AND is_used = false`,
      [userHash, otp, purpose]
    );
    const verification = result.rows[0];
    if (!verification) return { valid: false, reason: 'Invalid OTP' };
    if (new Date() > new Date(verification.expires_at)) {
      return { valid: false, reason: 'OTP expired' };
    }
    await query(
      'UPDATE otp_verifications SET is_used = true WHERE id = $1',
      [verification.id]
    );
    return { valid: true };
  }
  static async createUserSession(userHash) {
    const sessionToken = jwt.sign(
      { userHash },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    const expiryTime = new Date(Date.now() + 24 * 60 * 60 * 1000); 
    const result = await query(
      `INSERT INTO user_sessions (user_hash, session_token, expires_at) 
       VALUES ($1, $2, $3) 
       RETURNING id`,
      [userHash, sessionToken, expiryTime]
    );
    return { sessionToken, sessionId: result.rows[0].id };
  }
  static async verifySessionToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const result = await query(
        `SELECT id, user_hash, expires_at 
         FROM user_sessions 
         WHERE session_token = $1 AND expires_at > NOW()`,
        [token]
      );
      if (result.rows.length === 0) {
        return { valid: false, reason: 'Session not found or expired' };
      }
      return { valid: true, userHash: decoded.userHash, sessionId: result.rows[0].id };
    } catch (error) {
      return { valid: false, reason: 'Invalid token' };
    }
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
      'SELECT id, username, password_hash, role, is_active, organization_id, service_id FROM workers WHERE username = $1',
      [username]
    );
    const worker = result.rows[0];
    if (!worker || !worker.is_active) {
      return { success: false, reason: 'Invalid credentials' };
    }
    const isValidPassword = await bcrypt.compare(password, worker.password_hash);
    if (!isValidPassword) {
      return { success: false, reason: 'Invalid credentials' };
    }
    const token = jwt.sign(
      { 
        workerId: worker.id, 
        username: worker.username, 
        role: worker.role,
        organizationId: worker.organization_id,
        serviceId: worker.service_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    return { 
      success: true, 
      token,
      admin: { 
        id: worker.id, 
        username: worker.username, 
        role: worker.role,
        organizationId: worker.organization_id,
        serviceId: worker.service_id
      }
    };
  }
  static async verifyAdminToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return { valid: true, admin: decoded };
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
  static async createAdminUser(username, password, role = 'worker', createdByAdminId = null) {
    try {
      const existingUser = await query(
        'SELECT id FROM admin_users WHERE username = $1',
        [username]
      );
      if (existingUser.rows.length > 0) {
        return { success: false, error: 'Username already exists' };
      }
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      const result = await query(
        `INSERT INTO admin_users (username, password_hash, role, created_by_admin_id) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id, username, role, created_at`,
        [username, passwordHash, role, createdByAdminId]
      );
      return {
        success: true,
        admin: result.rows[0]
      };
    } catch (error) {
      console.error('Error creating admin user:', error);
      return { success: false, error: 'Failed to create admin user' };
    }
  }
  static async getAllAdminUsers() {
    const result = await query(
      `SELECT id, username, role, is_active, last_login, created_at 
       FROM admin_users 
       ORDER BY created_at DESC`
    );
    return result.rows;
  }
  static async updateAdminUser(adminId, updates) {
    const { username, role, is_active } = updates;
    const result = await query(
      `UPDATE admin_users 
       SET username = COALESCE($2, username),
           role = COALESCE($3, role),
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
       WHERE id = $1 
       RETURNING id, username, role, is_active, updated_at`,
      [adminId, username, role, is_active]
    );
    if (result.rows.length === 0) {
      return { success: false, error: 'Admin user not found' };
    }
    return { success: true, admin: result.rows[0] };
  }
  static async deleteAdminUser(adminId) {
    const adminCount = await query('SELECT COUNT(*) as count FROM admin_users WHERE is_active = true');
    if (parseInt(adminCount.rows[0].count) <= 1) {
      return { success: false, error: 'Cannot delete the last active admin user' };
    }
    const result = await query(
      'DELETE FROM admin_users WHERE id = $1 RETURNING id, username',
      [adminId]
    );
    if (result.rows.length === 0) {
      return { success: false, error: 'Admin user not found' };
    }
    return { success: true, deleted: result.rows[0] };
  }
}
module.exports = AuthModel;