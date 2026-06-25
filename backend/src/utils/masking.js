/**
 * Utility functions for PII Masking
 */

/**
 * Mask an Aadhaar number, keeping only the last 4 digits.
 * E.g., "123456789012" -> "XXXX-XXXX-9012"
 */
function maskAadhaar(aadhaar) {
  if (!aadhaar) return aadhaar;
  const clean = aadhaar.replace(/\D/g, '');
  if (clean.length === 12) {
    return `XXXX-XXXX-${clean.slice(-4)}`;
  }
  return 'XXXX-XXXX-XXXX';
}

/**
 * Mask a phone number, keeping only the last 4 digits.
 * E.g., "9876543210" -> "XXXXXX3210"
 */
function maskPhone(phone) {
  if (!phone) return phone;
  const clean = phone.replace(/\D/g, '');
  if (clean.length >= 10) {
    return `XXXXXX${clean.slice(-4)}`;
  }
  return 'XXXXXX';
}

/**
 * Apply masking rules to an identifier dynamically based on its type or shape.
 */
function maskIdentifier(identifier) {
  if (!identifier) return identifier;
  const strId = identifier.toString();
  
  if (/^\d{10}$/.test(strId)) {
    return maskPhone(strId);
  }
  
  if (/^\d{12}$/.test(strId)) {
    return maskAadhaar(strId);
  }

  // Generic mask for student ID or other formats: mask all but last 3 characters
  if (strId.length > 3) {
    return '*'.repeat(strId.length - 3) + strId.slice(-3);
  }

  return '***';
}

module.exports = {
  maskAadhaar,
  maskPhone,
  maskIdentifier
};
