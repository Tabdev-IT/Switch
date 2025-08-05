/**
 * Validation utilities for the Bank Inquired API
 */

// Validate RRN (12 digits, no special characters)
function validateRRN(rrn) {
  if (!rrn || typeof rrn !== 'string') {
    return { isValid: false, error: 'E2', message: 'Please check RRN must be 12 digit and not include any characters' };
  }
  
  if (!/^\d{12}$/.test(rrn)) {
    return { isValid: false, error: 'E2', message: 'Please check RRN must be 12 digit and not include any characters' };
  }
  
  return { isValid: true };
}

// Validate STAN (6 digits, no special characters)
function validateSTAN(stan) {
  if (!stan || typeof stan !== 'string') {
    return { isValid: false, error: 'E3', message: 'Please check STAN must be 6 digit and not include any characters' };
  }
  
  if (!/^\d{6}$/.test(stan)) {
    return { isValid: false, error: 'E3', message: 'Please check STAN must be 6 digit and not include any characters' };
  }
  
  return { isValid: true };
}

// Validate TXNAMT (12 digits, can be all zeros)
function validateTXNAMT(txnamt) {
  if (!txnamt || typeof txnamt !== 'string') {
    return { isValid: false, error: 'E4', message: 'Please check TXNAMT' };
  }
  
  // Check if it's exactly 12 digits (can be all zeros)
  if (!/^\d{12}$/.test(txnamt)) {
    return { isValid: false, error: 'E4', message: 'Please check TXNAMT' };
  }
  
  return { isValid: true };
}

// Validate TERMID (6-8 digits, no special characters)
function validateTERMID(termid) {
  if (!termid || typeof termid !== 'string') {
    return { isValid: false, error: 'E5', message: 'Please check termid must be not less than 6 and not more then 8 digit and not include any special characters' };
  }
  
  if (!/^\d{6,8}$/.test(termid)) {
    return { isValid: false, error: 'E5', message: 'Please check termid must be not less than 6 and not more then 8 digit and not include any special characters' };
  }
  
  return { isValid: true };
}

// Validate SETLDATE (DD-MM-YYYY format)
function validateSETLDATE(setldate) {
  if (!setldate || typeof setldate !== 'string') {
    return { isValid: false, error: 'E6', message: 'Please check txn date' };
  }
  
  // Check format DD-MM-YYYY
  if (!/^\d{2}-\d{2}-\d{4}$/.test(setldate)) {
    return { isValid: false, error: 'E7', message: 'Date format must be DD-MM-YYYY' };
  }
  
  // Validate date components
  const [day, month, year] = setldate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  
  if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
    return { isValid: false, error: 'E6', message: 'Please check txn date' };
  }
  
  return { isValid: true };
}

// Validate TargetSystemUserID - must be exactly "SWITCHUSER"
function validateTargetSystemUserID(userId) {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    return { isValid: false, error: 'E1', message: 'Please check user id' };
  }
  
  if (userId.trim() !== 'SWITCHUSER') {
    return { isValid: false, error: 'E1', message: 'Please check user id' };
  }
  
  return { isValid: true };
}

// Validate complete request body
function validateRequestBody(body) {
  // Check if body exists
  if (!body) {
    return { isValid: false, error: 'E9', message: 'Core bank system error' };
  }
  
  // Validate HeaderSwitchModel
  if (!body.HeaderSwitchModel) {
    return { isValid: false, error: 'E1', message: 'Please check user id' };
  }
  
  const userValidation = validateTargetSystemUserID(body.HeaderSwitchModel.TargetSystemUserID);
  if (!userValidation.isValid) {
    return userValidation;
  }
  
  // Validate LookUpData
  if (!body.LookUpData || !body.LookUpData.Details) {
    return { isValid: false, error: 'E9', message: 'Core bank system error' };
  }
  
  const details = body.LookUpData.Details;
  
  // Validate all required fields
  const validations = [
    validateRRN(details.RRN),
    validateSTAN(details.STAN),
    validateTXNAMT(details.TXNAMT),
    validateTERMID(details.TERMID),
    validateSETLDATE(details.SETLDATE)
  ];
  
  for (const validation of validations) {
    if (!validation.isValid) {
      return validation;
    }
  }
  
  return { isValid: true };
}

module.exports = {
  validateRRN,
  validateSTAN,
  validateTXNAMT,
  validateTERMID,
  validateSETLDATE,
  validateTargetSystemUserID,
  validateRequestBody
}; 