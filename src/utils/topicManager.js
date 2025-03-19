const fs = require('fs');
const path = require('path');

// Path to topic settings file
const TOPIC_SETTINGS_FILE = path.join(__dirname, '../../data/topic_settings.json');

// Default settings structure
const DEFAULT_SETTINGS = {
  defaultTopic: null,  // Default topic ID (null means no default)
  topicMappings: {}    // Map of email/pattern to topic ID
};

/**
 * Ensure data directory exists
 */
function ensureDataDir() {
  const dataDir = path.dirname(TOPIC_SETTINGS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * Get current topic settings
 * @returns {Object} Topic settings object
 */
function getTopicSettings() {
  try {
    ensureDataDir();
    
    if (!fs.existsSync(TOPIC_SETTINGS_FILE)) {
      // Create default settings file if it doesn't exist
      fs.writeFileSync(TOPIC_SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
      return { ...DEFAULT_SETTINGS };
    }
    
    const data = fs.readFileSync(TOPIC_SETTINGS_FILE, 'utf8');
    const settings = JSON.parse(data);
    
    // Ensure required properties exist
    if (!settings.hasOwnProperty('defaultTopic')) {
      settings.defaultTopic = null;
    }
    if (!settings.hasOwnProperty('topicMappings')) {
      settings.topicMappings = {};
    }
    
    return settings;
  } catch (error) {
    console.error('Error loading topic settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save topic settings
 * @param {Object} settings - Topic settings to save
 * @returns {boolean} Success status
 */
function saveTopicSettings(settings) {
  try {
    ensureDataDir();
    fs.writeFileSync(TOPIC_SETTINGS_FILE, JSON.stringify(settings, null, 2));
    
    // Log settings for debugging
    console.log('Topic settings saved:', settings);
    return true;
  } catch (error) {
    console.error('Error saving topic settings:', error);
    return false;
  }
}

/**
 * Set default topic ID
 * @param {string|number|null} topicId - Topic ID to set as default (null to clear)
 * @returns {Object} Result with success status and message
 */
function setDefaultTopic(topicId) {
  try {
    // Allow null to clear the default topic
    if (topicId !== null) {
      // Validate topic ID
      if (!isValidTopicId(topicId)) {
        return { 
          success: false, 
          message: `Invalid topic ID: ${topicId}. Must be a positive number.`
        };
      }
      
      // Convert to number
      topicId = parseInt(topicId, 10);
    }
    
    const settings = getTopicSettings();
    settings.defaultTopic = topicId;
    
    if (saveTopicSettings(settings)) {
      return { 
        success: true, 
        message: topicId === null ? 'Default topic cleared' : `Default topic set to ${topicId}`
      };
    } else {
      return { 
        success: false, 
        message: 'Failed to save settings'
      };
    }
  } catch (error) {
    console.error('Error setting default topic:', error);
    return { 
      success: false, 
      message: `Error: ${error.message}`
    };
  }
}

/**
 * Get default topic ID
 * @returns {number|null} Default topic ID or null if not set
 */
function getDefaultTopic() {
  const settings = getTopicSettings();
  return settings.defaultTopic;
}

/**
 * Set topic for a specific email or pattern
 * @param {string} emailOrPattern - Email address or pattern to set topic for
 * @param {string|number} topicId - Topic ID to assign
 * @returns {Object} Result with success status and message
 */
function setTopicForEmail(emailOrPattern, topicId) {
  try {
    if (!emailOrPattern) {
      return { 
        success: false, 
        message: 'Email address or pattern is required'
      };
    }
    
    // Validate topic ID
    if (!isValidTopicId(topicId)) {
      return { 
        success: false, 
        message: `Invalid topic ID: ${topicId}. Must be a positive number.`
      };
    }
    
    // Convert to number
    topicId = parseInt(topicId, 10);
    
    // Normalize email to lowercase
    emailOrPattern = emailOrPattern.toLowerCase();
    
    const settings = getTopicSettings();
    settings.topicMappings[emailOrPattern] = topicId;
    
    if (saveTopicSettings(settings)) {
      return { 
        success: true, 
        message: `Topic ID ${topicId} set for ${emailOrPattern}`
      };
    } else {
      return { 
        success: false, 
        message: 'Failed to save settings'
      };
    }
  } catch (error) {
    console.error('Error setting topic for email:', error);
    return { 
      success: false, 
      message: `Error: ${error.message}`
    };
  }
}

/**
 * Remove topic mapping for a specific email or pattern
 * @param {string} emailOrPattern - Email address or pattern to remove topic for
 * @returns {Object} Result with success status and message
 */
function removeTopicForEmail(emailOrPattern) {
  try {
    if (!emailOrPattern) {
      return { 
        success: false, 
        message: 'Email address or pattern is required'
      };
    }
    
    // Normalize email to lowercase
    emailOrPattern = emailOrPattern.toLowerCase();
    
    const settings = getTopicSettings();
    
    if (settings.topicMappings.hasOwnProperty(emailOrPattern)) {
      delete settings.topicMappings[emailOrPattern];
      
      if (saveTopicSettings(settings)) {
        return { 
          success: true, 
          message: `Topic mapping removed for ${emailOrPattern}`
        };
      } else {
        return { 
          success: false, 
          message: 'Failed to save settings'
        };
      }
    } else {
      return { 
        success: false, 
        message: `No topic mapping found for ${emailOrPattern}`
      };
    }
  } catch (error) {
    console.error('Error removing topic for email:', error);
    return { 
      success: false, 
      message: `Error: ${error.message}`
    };
  }
}

/**
 * Get all topic mappings
 * @returns {Object} Map of email/pattern to topic ID
 */
function getTopicMappings() {
  const settings = getTopicSettings();
  return settings.topicMappings || {};
}

/**
 * Get topic ID for a specific email address
 * @param {string} email - Email address to get topic for
 * @returns {number|null} Topic ID or null if not found
 */
function getTopicForEmail(email) {
  if (!email) return getDefaultTopic();
  
  try {
    const settings = getTopicSettings();
    email = email.toLowerCase();
    
    // Check for direct match
    if (settings.topicMappings.hasOwnProperty(email)) {
      return settings.topicMappings[email];
    }
    
    // Check for domain wildcard match
    const domain = email.split('@')[1];
    if (domain && settings.topicMappings.hasOwnProperty(`*@${domain}`)) {
      return settings.topicMappings[`*@${domain}`];
    }
    
    // Return default topic if no match found
    return settings.defaultTopic;
  } catch (error) {
    console.error('Error getting topic for email:', error);
    return getDefaultTopic();
  }
}

/**
 * Validate topic ID format
 * @param {string|number} topicId - Topic ID to validate
 * @returns {boolean} True if topic ID is valid
 */
function isValidTopicId(topicId) {
  const numericId = parseInt(topicId, 10);
  return !isNaN(numericId) && numericId > 0;
}

/**
 * Validate that the topic exists in the specified chat
 * @param {Object} bot - Telegram bot instance
 * @param {string|number} chatId - Chat ID
 * @param {string|number} topicId - Topic ID
 * @returns {Promise<boolean>} Promise resolving to true if topic exists
 */
async function validateTopicExists(bot, chatId, topicId) {
  try {
    // If bot or chatId are not valid, just return false
    if (!bot || !bot.telegram || !chatId) {
      return false;
    }
    
    // If topicId is not valid, no need to check
    if (!isValidTopicId(topicId)) {
      return false;
    }
    
    // Try to get chat information
    const chatInfo = await bot.telegram.getChat(chatId);
    
    // Check if chat supports topics
    if (!chatInfo || !chatInfo.is_forum) {
      console.log('Chat does not support topics');
      return false;
    }
    
    // Unfortunately, Telegram API doesn't provide a direct way to get topics list
    // but we can try to "ping" the topic by sending and immediately deleting a message
    
    try {
      // Try sending a message to the topic
      const result = await bot.telegram.sendMessage(
        chatId, 
        '_Topic validation_', 
        { 
          message_thread_id: topicId,
          parse_mode: 'Markdown',
          disable_notification: true
        }
      );
      
      // If we got here, the topic exists - immediately delete the test message
      if (result && result.message_id) {
        await bot.telegram.deleteMessage(chatId, result.message_id);
      }
      
      return true;
    } catch (error) {
      // If we get a "message thread not found" error, the topic doesn't exist
      if (error.message && error.message.includes('message thread not found')) {
        console.log(`Topic ID ${topicId} does not exist in chat ${chatId}`);
        return false;
      }
      
      // For other errors, log but assume topic might exist
      console.error('Error validating topic:', error);
      return false;
    }
  } catch (error) {
    console.error('Error validating topic exists:', error);
    return false;
  }
}

module.exports = {
  getTopicSettings,
  setDefaultTopic,
  getDefaultTopic,
  setTopicForEmail,
  removeTopicForEmail,
  getTopicMappings,
  getTopicForEmail,
  isValidTopicId,
  validateTopicExists
}; 