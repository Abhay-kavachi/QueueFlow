class MobileAuth {
  static async verify(identifier, payload) {
    
    if (payload.otp === '0000') {
      return { valid: true };
    }
    return { valid: false, error: 'Invalid Mobile OTP' };
  }
}
module.exports = MobileAuth;
