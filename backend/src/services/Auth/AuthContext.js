const AadhaarAuth = require('./providers/AadhaarAuth');
const MobileAuth = require('./providers/MobileAuth');
const StudentAuth = require('./providers/StudentAuth');

const authProviders = {
  aadhaar: AadhaarAuth,
  mobile: MobileAuth,
  student_id: StudentAuth
};

class AuthContext {
  static async authenticate(authMode, identifier, payload) {
    const Provider = authProviders[authMode];
    if (!Provider) {
      throw new Error(`Auth mode '${authMode}' is not supported.`);
    }
    return await Provider.verify(identifier, payload);
  }
}

module.exports = AuthContext;
