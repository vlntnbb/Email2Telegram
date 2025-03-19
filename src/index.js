require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { setupEmailListener } = require('./services/emailService');
const { setupTelegramBot } = require('./services/telegramService');
const { cleanupOldFiles } = require('./utils/fileUtils');
const { ensureWhitelistFile } = require('./utils/whitelistManager');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Создаем каталоги для данных если они не существуют
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('Created data directory');
}

// Проверка на уже запущенные экземпляры
function checkRunningInstance(port) {
  return new Promise((resolve) => {
    const testServer = http.createServer();
    testServer.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} is already in use, trying another port...`);
        resolve(false);
      } else {
        console.error('Error checking port:', err);
        resolve(false);
      }
    });
    
    testServer.once('listening', () => {
      testServer.close(() => {
        resolve(true);
      });
    });
    
    testServer.listen(port);
  });
}

async function startServer() {
  // Ensure whitelist file exists
  ensureWhitelistFile();
  
  // Initialize Telegram bot
  const telegramBot = setupTelegramBot();
  
  // Setup email listener
  setupEmailListener(telegramBot);
  
  // Create Express server
  const app = express();
  app.use(bodyParser.json());
  
  // Basic health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      message: 'Email2Telegram service is running'
    });
  });
  
  // Find available port
  let port = parseInt(process.env.SERVER_PORT || 3000, 10);
  const maxPortAttempts = 10;
  let portAvailable = false;
  
  for (let attempt = 0; attempt < maxPortAttempts; attempt++) {
    portAvailable = await checkRunningInstance(port);
    if (portAvailable) break;
    port++;
  }
  
  if (!portAvailable) {
    console.error(`Could not find an available port after ${maxPortAttempts} attempts. Exiting.`);
    process.exit(1);
  }
  
  // Start the server
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

// Запускаем сервер
startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
}); 