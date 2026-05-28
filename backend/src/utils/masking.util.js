

function maskIdentifier(identifier) {
  if (!identifier) return identifier;
  
  
  if (/^\d{12}$/.test(identifier)) {
    return `XXXX-XXXX-${identifier.slice(-4)}`;
  }
  
  
  if (/^\d{10}$/.test(identifier)) {
    return `XXXXXX${identifier.slice(-4)}`;
  }
  
  
  if (identifier.length > 4) {
    return `XXXX-${identifier.slice(-4)}`;
  }
  
  return 'XXXX'; 
}

module.exports = { maskIdentifier };
