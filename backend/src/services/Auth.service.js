const AuthModel = require('../models/Auth.model');
const QueueModel = require('../models/Queue.model');
const { query } = require('../utils/database');

class AuthService {
  static async requestOTP(identifier, purpose = 'checkin') {
    try {
      if (!identifier || identifier.toString().trim().length < 4) {
        return {
          success: false,
          error: 'Invalid identifier (minimum 4 characters required)'
        };
      }
      
      const cleanIdentifier = identifier.toString().trim();

      
      const userExists = await query('SELECT 1 FROM users WHERE identifier = $1', [cleanIdentifier]);
      if (userExists.rows.length === 0) {
        
        const suffix = cleanIdentifier.length > 4 ? cleanIdentifier.slice(-4) : cleanIdentifier;
        const autoName = `User-${suffix}`;
        await query(
          'INSERT INTO users (identifier, full_name) VALUES ($1, $2)', 
          [cleanIdentifier, autoName]
        );
        console.log(`Auto-registered new user: ${autoName}`);
      }

      const userHash = AuthModel.hashIdentifier(identifier);
      const otp = AuthModel.generateOTP();
      await AuthModel.storeOTP(userHash, otp, purpose);
      console.log(`OTP for ${identifier}: ${otp}`); 
      const AuditService = require('./Audit.service');
      await AuditService.logEvent({
        tenantId: '00000000-0000-0000-0000-000000000000', // Global action
        userId: userHash,
        action: 'OTP_REQUESTED',
        entityType: 'User',
        entityId: userHash,
        metadata: { purpose }
      });

      return {
        success: true,
        message: 'OTP sent successfully',
        userHash,
        otp: process.env.DEMO_MODE === 'true' ? otp : undefined
      };
    } catch (error) {
      console.error('OTP request error:', error);
      return {
        success: false,
        error: 'Failed to generate OTP'
      };
    }
  }
  static async verifyOTPAndLogin(userHash, otp, purpose = 'checkin', req = {}) {
    const AuditService = require('./Audit.service');
    try {
      const verificationResult = await AuthModel.verifyOTP(userHash, otp, purpose);
      if (!verificationResult.valid) {
        await AuditService.logEvent({
          tenantId: '00000000-0000-0000-0000-000000000000',
          userId: userHash,
          action: 'LOGIN_FAILED',
          entityType: 'User',
          entityId: userHash,
          correlationId: req.correlationId,
          metadata: { reason: verificationResult.reason }
        });
        return {
          success: false,
          error: verificationResult.reason
        };
      }
      
      await AuditService.logEvent({
        tenantId: '00000000-0000-0000-0000-000000000000',
        userId: userHash,
        action: 'OTP_VERIFIED',
        entityType: 'User',
        entityId: userHash,
        correlationId: req.correlationId,
        metadata: { purpose }
      });

      const sessionResult = await AuthModel.createUserSession(userHash);
      
      await AuditService.logEvent({
        tenantId: '00000000-0000-0000-0000-000000000000',
        userId: userHash,
        action: 'SESSION_CREATED',
        entityType: 'Session',
        entityId: sessionResult.sessionId,
        correlationId: req.correlationId,
        metadata: {}
      });

      return {
        success: true,
        sessionToken: sessionResult.sessionToken,
        refreshToken: sessionResult.refreshToken,
        message: 'Login successful'
      };
    } catch (error) {
      console.error('OTP verification error:', error);
      return {
        success: false,
        error: 'Failed to verify OTP'
      };
    }
  }
  static async verifySession(sessionToken) {
    try {
      const verificationResult = await AuthModel.verifySessionToken(sessionToken);
      if (!verificationResult.valid) {
        return {
          valid: false,
          error: verificationResult.reason
        };
      }
      return {
        valid: true,
        userHash: verificationResult.userHash,
        sessionId: verificationResult.sessionId
      };
    } catch (error) {
      return {
        valid: false,
        error: 'Session verification failed'
      };
    }
  }
  static async logout(sessionId, req = {}) {
    try {
      await AuthModel.revokeSession(sessionId);
      const AuditService = require('./Audit.service');
      await AuditService.logEvent({
        tenantId: '00000000-0000-0000-0000-000000000000',
        userId: 'system',
        action: 'SESSION_REVOKED',
        entityType: 'Session',
        entityId: sessionId,
        correlationId: req.correlationId,
        metadata: {}
      });
      return { success: true, message: 'Logged out successfully' };
    } catch (error) {
      return { success: false, error: 'Logout failed' };
    }
  }
  static async adminLogin(username, password, req = {}) {
    const AuditService = require('./Audit.service');
    try {
      const result = await AuthModel.authenticateAdmin(username, password);
      if (!result.success) {
        await AuditService.logEvent({
          tenantId: '00000000-0000-0000-0000-000000000000',
          userId: username,
          action: 'LOGIN_FAILED',
          entityType: 'Staff',
          entityId: username,
          correlationId: req.correlationId,
          metadata: { reason: result.error }
        });
      }
      return result;
    } catch (error) {
      console.error('Admin login error:', error);
      return {
        success: false,
        error: 'Admin authentication failed'
      };
    }
  }
  static async verifyAdminToken(token) {
    try {
      const verificationResult = await AuthModel.verifyAdminToken(token);
      if (!verificationResult.valid) {
        return {
          valid: false,
          error: verificationResult.reason
        };
      }
      return {
        valid: true,
        admin: verificationResult.admin
      };
    } catch (error) {
      return {
        valid: false,
        error: 'Admin token verification failed'
      };
    }
  }
  static async workerVerifyUser(identifier, workerToken, req = {}) {
    try {
      const adminVerification = await this.verifyAdminToken(workerToken);
      const AuditService = require('./Audit.service');
      if (!adminVerification.valid) {
        await AuditService.logEvent({
          tenantId: '00000000-0000-0000-0000-000000000000',
          userId: identifier,
          action: 'LOGIN_FAILED',
          entityType: 'User',
          entityId: identifier,
          correlationId: req.correlationId,
          metadata: { reason: 'Unauthorized worker access' }
        });
        return {
          success: false,
          error: 'Unauthorized worker access'
        };
      }
      const userHash = AuthModel.hashIdentifier(identifier);
      const sessionResult = await AuthModel.createUserSession(userHash);
      
      await AuditService.logEvent({
        tenantId: '00000000-0000-0000-0000-000000000000',
        userId: userHash,
        action: 'SESSION_CREATED',
        entityType: 'Session',
        entityId: sessionResult.sessionId,
        correlationId: req.correlationId,
        metadata: { createdByWorker: adminVerification.admin.id }
      });

      return {
        success: true,
        sessionToken: sessionResult.sessionToken,
        refreshToken: sessionResult.refreshToken,
        userHash,
        message: 'Worker verification successful'
      };
    } catch (error) {
      console.error('Worker verification error:', error);
      return {
        success: false,
        error: 'Worker verification failed'
      };
    }
  }
  static async cleanupExpiredTokens() {
    try {
      await AuthModel.cleanupExpiredTokens();
      return { success: true, message: 'Cleanup completed' };
    } catch (error) {
      console.error('Token cleanup error:', error);
      return { success: false, error: 'Cleanup failed' };
    }
  }
  static async validateMultipleServices(userHash, newServiceId) {
    try {
      const activeServices = await AuthModel.getUserActiveServices(userHash);
      const activeInAnyService = activeServices.some(service => 
        service.state === 'active'
      );
      if (activeInAnyService) {
        return {
          valid: false,
          error: 'User is already active in another service'
        };
      }
      return {
        valid: true,
        activeServices
      };
    } catch (error) {
      return {
        valid: false,
        error: 'Failed to validate service constraints'
      };
    }
  }
}
module.exports = AuthService;