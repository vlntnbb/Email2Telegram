const fs = require('fs');
const path = require('path');

// Path to the whitelist JSON file
const whitelistPath = path.join(__dirname, '../../data/whitelist.json');

// Make sure the data directory exists
function ensureDataDir() {
  const dataDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * Ensure whitelist file exists
 * Creates a default empty whitelist if it doesn't exist
 */
function ensureWhitelistFile() {
  ensureDataDir();
  
  if (!fs.existsSync(whitelistPath)) {
    console.log('Creating default whitelist file...');
    saveWhitelist([]);
  }
  
  return true;
}

// Get the current whitelist
function getWhitelist() {
  ensureDataDir();
  
  if (!fs.existsSync(whitelistPath)) {
    // If the whitelist file doesn't exist, create an empty one
    saveWhitelist([]);
    return [];
  }
  
  try {
    const data = fs.readFileSync(whitelistPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading whitelist:', error);
    return [];
  }
}

// Save the whitelist
function saveWhitelist(whitelist) {
  ensureDataDir();
  
  try {
    fs.writeFileSync(whitelistPath, JSON.stringify(whitelist, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving whitelist:', error);
    return false;
  }
}

// Add an email to the whitelist
function addToWhitelist(email) {
  const whitelist = getWhitelist();
  
  // Check if email already exists in whitelist
  if (whitelist.includes(email)) {
    return { success: false, message: 'Email already in whitelist' };
  }
  
  // Add email to whitelist
  whitelist.push(email);
  
  // Save whitelist
  if (saveWhitelist(whitelist)) {
    return { success: true, message: 'Email added to whitelist' };
  } else {
    return { success: false, message: 'Failed to add email to whitelist' };
  }
}

// Remove an email from the whitelist
function removeFromWhitelist(email) {
  const whitelist = getWhitelist();
  
  // Check if email exists in whitelist
  if (!whitelist.includes(email)) {
    return { success: false, message: 'Email not found in whitelist' };
  }
  
  // Remove email from whitelist
  const newWhitelist = whitelist.filter(e => e !== email);
  
  // Save whitelist
  if (saveWhitelist(newWhitelist)) {
    return { success: true, message: 'Email removed from whitelist' };
  } else {
    return { success: false, message: 'Failed to remove email from whitelist' };
  }
}

/**
 * Check if a pattern is a domain wildcard pattern (*@domain.com)
 * @param {string} pattern - Pattern to check
 * @returns {boolean} True if pattern is a domain wildcard
 */
function isDomainWildcard(pattern) {
  return pattern.startsWith('*@') && pattern.split('@').length === 2;
}

/**
 * Check if an email matches a domain wildcard pattern
 * @param {string} email - Email to check
 * @param {string} pattern - Wildcard pattern (*@domain.com)
 * @returns {boolean} True if email matches pattern
 */
function matchesDomainWildcard(email, pattern) {
  if (!email || !pattern || !isDomainWildcard(pattern)) {
    return false;
  }
  
  const emailParts = email.split('@');
  if (emailParts.length !== 2) {
    return false;
  }
  
  const patternDomain = pattern.split('@')[1].toLowerCase();
  const emailDomain = emailParts[1].toLowerCase();
  
  return emailDomain === patternDomain;
}

// Check if an email is in the whitelist
function isWhitelisted(email) {
  const whitelist = getWhitelist();
  
  // If whitelist is empty, accept all emails
  if (whitelist.length === 0) {
    return true;
  }
  
  // Check for exact match
  if (whitelist.includes(email)) {
    return true;
  }
  
  // Check for domain wildcard matches
  const domainWildcards = whitelist.filter(pattern => isDomainWildcard(pattern));
  for (const pattern of domainWildcards) {
    if (matchesDomainWildcard(email, pattern)) {
      return true;
    }
  }
  
  return false;
}

module.exports = {
  getWhitelist,
  addToWhitelist,
  removeFromWhitelist,
  isWhitelisted,
  isDomainWildcard,
  ensureWhitelistFile
}; 