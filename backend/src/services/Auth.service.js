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
      return {
        success: true,
        message: 'OTP sent successfully',
        userHash 
      };
    } catch (error) {
      console.error('OTP request error:', error);
      return {
        success: false,
        error: 'Failed to generate OTP'
      };
    }
  }
  static async verifyOTPAndLogin(userHash, otp, purpose = 'checkin') {
    try {
      const verificationResult = await AuthModel.verifyOTP(userHash, otp, purpose);
      if (!verificationResult.valid) {
        return {
          success: false,
          error: verificationResult.reason
        };
      }
      const sessionResult = await AuthModel.createUserSession(userHash);
      return {
        success: true,
        sessionToken: sessionResult.sessionToken,
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
  static async logout(sessionId) {
    try {
      await AuthModel.invalidateSession(sessionId);
      return { success: true, message: 'Logged out successfully' };
    } catch (error) {
      return { success: false, error: 'Logout failed' };
    }
  }
  static async adminLogin(username, password) {
    try {
      const result = await AuthModel.authenticateAdmin(username, password);
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
  static async workerVerifyUser(identifier, workerToken) {
    try {
      const adminVerification = await this.verifyAdminToken(workerToken);
      if (!adminVerification.valid) {
        return {
          success: false,
          error: 'Unauthorized worker access'
        };
      }
      const userHash = AuthModel.hashIdentifier(identifier);
      const sessionResult = await AuthModel.createUserSession(userHash);
      return {
        success: true,
        sessionToken: sessionResult.sessionToken,
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