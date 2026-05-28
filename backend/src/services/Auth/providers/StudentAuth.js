class StudentAuth {
  static async verify(identifier, payload) {
    
    
    if (payload.password === 'password123') {
      return { valid: true };
    }
    return { valid: false, error: 'Invalid Student ID password' };
  }
}
module.exports = StudentAuth;
