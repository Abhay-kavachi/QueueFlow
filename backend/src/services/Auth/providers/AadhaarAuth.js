class AadhaarAuth {
  static async verify(identifier, payload) {
    
    
    if (payload.otp === '123456') {
      return { valid: true };
    }
    return { valid: false, error: 'Invalid Aadhaar OTP' };
  }
}
module.exports = AadhaarAuth;
