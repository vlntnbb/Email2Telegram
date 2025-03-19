const fs = require('fs');
const path = require('path');

/**
 * Save a file to disk
 * @param {Buffer} buffer - File buffer to save
 * @param {string} filename - Name of the file
 * @returns {Promise<string>} Path to the saved file
 */
async function saveFile(buffer, filename) {
  // Create uploads directory if it doesn't exist
  const uploadDir = path.join(__dirname, '../../uploads');
  
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  const filePath = path.join(uploadDir, filename);
  
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, buffer, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(filePath);
    });
  });
}

/**
 * Delete a file from disk
 * @param {string} filePath - Path to the file
 * @returns {Promise<boolean>} True if successful
 */
async function deleteFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err) {
        // If the file doesn't exist, consider it already deleted
        if (err.code === 'ENOENT') {
          resolve(true);
          return;
        }
        reject(err);
        return;
      }
      resolve(true);
    });
  });
}

/**
 * Clean up old files in the uploads directory
 * @param {number} maxAgeHours - Maximum age in hours before files are deleted
 * @returns {Promise<number>} Number of files deleted
 */
async function cleanupOldFiles(maxAgeHours = 24) {
  const uploadDir = path.join(__dirname, '../../uploads');
  
  if (!fs.existsSync(uploadDir)) {
    return 0;
  }
  
  return new Promise((resolve, reject) => {
    fs.readdir(uploadDir, async (err, files) => {
      if (err) {
        reject(err);
        return;
      }
      
      const now = Date.now();
      const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert hours to milliseconds
      let deletedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(uploadDir, file);
        
        try {
          const stats = fs.statSync(filePath);
          const fileAge = now - stats.mtimeMs;
          
          if (fileAge > maxAge) {
            await deleteFile(filePath);
            deletedCount++;
          }
        } catch (error) {
          console.error(`Error processing file ${file}:`, error);
        }
      }
      
      resolve(deletedCount);
    });
  });
}

module.exports = {
  saveFile,
  deleteFile,
  cleanupOldFiles
}; 