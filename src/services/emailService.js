const nodemailer = require('nodemailer');
const { convertEmailToPdf } = require('../utils/pdfConverter');
const { saveFile } = require('../utils/fileUtils');
const { isWhitelisted } = require('../utils/whitelistManager');
const { getTopicForEmail } = require('../utils/topicManager');
const Imap = require('imap');
const MailParser = require('mailparser').MailParser;
const fs = require('fs');

// Для вывода отладочных сообщений
const DEBUG = true;

/**
 * Вывод отладочной информации
 * @param {string} message - Сообщение для вывода
 * @param {*} data - Дополнительные данные (опционально)
 */
function debug(message, data = null) {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    console.log(`[DEBUG ${timestamp}] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Setup email listener to monitor incoming emails
 * @param {Object} telegramBot - Initialized Telegram bot instance
 */
function setupEmailListener(telegramBot) {
  debug('Настройка прослушивания писем...');
  
  // Keep track of reconnection attempts
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;
  const reconnectDelay = 10000; // 10 seconds

  function createImapConnection() {
    debug('Создание IMAP-соединения...');
    const imap = new Imap({
      user: process.env.EMAIL_USER,
      password: process.env.EMAIL_PASS,
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      debug: DEBUG ? console.log : null // Включаем отладку IMAP если DEBUG включен
    });

    function openInbox(cb) {
      debug('Открытие почтового ящика...');
      imap.openBox('INBOX', false, cb);
    }

    imap.once('ready', function() {
      // Reset reconnect attempts on successful connection
      reconnectAttempts = 0;
      debug('IMAP-соединение установлено успешно');
      
      openInbox(function(err, box) {
        if (err) {
          console.error('Error opening inbox:', err);
          return;
        }
        debug(`Почтовый ящик открыт, всего писем: ${box.messages.total}`);
        console.log('Email listener started');

        imap.on('mail', function(numNewMsgs) {
          // Process new emails when they arrive
          debug(`Получено ${numNewMsgs} новых писем`);
          processNewEmails(telegramBot);
        });
        
        // Также отслеживаем другие события IMAP
        imap.on('expunge', function(seqno) {
          debug(`Письмо ${seqno} было удалено`);
        });
        
        imap.on('update', function(seqno, info) {
          debug(`Письмо ${seqno} обновлено`, info);
        });
      });
    });

    imap.once('error', function(err) {
      console.error('Email connection error:', err);
      debug('Ошибка IMAP-соединения', err);
      
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        debug(`Попытка переподключения ${reconnectAttempts}/${maxReconnectAttempts} через ${reconnectDelay/1000} сек...`);
        setTimeout(createImapConnection, reconnectDelay);
      } else {
        console.error(`Failed to reconnect after ${maxReconnectAttempts} attempts`);
        debug(`Не удалось переподключиться после ${maxReconnectAttempts} попыток`);
      }
    });

    imap.once('end', function() {
      debug('IMAP-соединение закрыто');
      console.log('IMAP connection ended');
    });

    imap.connect();
    return imap;
  }

  createImapConnection();
}

/**
 * Process new emails from inbox
 * @param {Object} telegramBot - Initialized Telegram bot instance
 */
async function processNewEmails(telegramBot) {
  debug('Начинаем проверку новых писем...');
  try {
    // Create mail server connection
    const imap = new Imap({
      user: process.env.EMAIL_USER,
      password: process.env.EMAIL_PASS,
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      debug: DEBUG ? console.log : null
    });
    
    // Date for searching emails - we want emails from the last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = yesterday.toISOString().split('T')[0];
    
    debug(`Ищем письма с даты: ${yesterdayDate}`);

    imap.once('ready', function() {
      debug('IMAP-соединение установлено для проверки писем');
      
      imap.openBox('INBOX', false, function(err, box) {
        if (err) {
          console.error('Error opening inbox:', err);
          debug('Ошибка открытия ящика', err);
          imap.end();
          return;
        }
        
        debug(`Ящик открыт, всего писем: ${box.messages.total}`);
        
        // Search for unread messages
        imap.search(['UNSEEN', ['SINCE', yesterday]], function(err, results) {
          if (err) {
            console.error('Error searching messages:', err);
            debug('Ошибка поиска писем', err);
            imap.end();
            return;
          }
          
          if (!results || !results.length) {
            console.log('No new emails');
            debug('Новых писем не найдено');
            imap.end();
            return;
          }
          
          debug(`Найдено ${results.length} новых писем: ${results.join(', ')}`);
          
          const fetch = imap.fetch(results, { bodies: '', markSeen: true });
          
          fetch.on('message', function(msg, seqno) {
            debug(`Обработка письма №${seqno}`);
            const parser = new MailParser();
            
            parser.on('end', async function(mail) {
              try {
                // Get sender email address
                const senderEmail = extractSenderEmail(mail.from);
                console.log(`Received email from: ${senderEmail}`);
                debug(`Отправитель: ${senderEmail}, Тема: ${mail.subject}`);
                
                // Check if sender is whitelisted
                if (!isWhitelisted(senderEmail)) {
                  console.log(`Email from ${senderEmail} is not whitelisted. Ignoring.`);
                  debug(`Отправитель ${senderEmail} не в белом списке, пропускаем письмо`);
                  return;
                }
                
                console.log(`Processing email: ${mail.subject}`);
                debug(`Начинаем обработку письма: ${mail.subject}`);
                
                // Extract forwarded message text if available
                const forwardedText = extractForwardedText(mail);
                if (forwardedText) {
                  debug(`Найден текст пересланного сообщения: ${forwardedText.substring(0, 100)}...`);
                }
                
                // Convert email to PDF
                debug('Конвертация письма в PDF...');
                const pdfBuffer = await convertEmailToPdf(mail);
                debug('PDF-файл создан успешно');
                
                // Save PDF file
                const filename = `email_${Date.now()}.pdf`;
                debug(`Сохранение PDF-файла: ${filename}`);
                const filePath = await saveFile(pdfBuffer, filename);
                debug(`PDF-файл сохранен: ${filePath}`);
                
                // Get topic ID for this email sender
                const topicId = getTopicForEmail(senderEmail);
                console.log(`Using topic ID ${topicId || 'none'} for email from ${senderEmail}`);
                debug(`Используем топик ID ${topicId || 'none'} для ${senderEmail}`);
                
                // Send PDF to Telegram - using the correct method
                try {
                  const chatId = process.env.TELEGRAM_CHAT_ID;
                  if (!telegramBot || !telegramBot.telegram) {
                    throw new Error('Telegram bot not initialized properly');
                  }
                  
                  // Prepare extra options including message_thread_id if available
                  let caption = `Email от ${senderEmail}: ${mail.subject || 'No Subject'}`;
                  
                  // Add forwarded text to caption if available
                  if (forwardedText) {
                    caption += `\n\n${forwardedText}`;
                  }
                  
                  const options = { caption };
                  
                  // Add message_thread_id only if topicId is not null
                  if (topicId !== null && topicId !== undefined) {
                    // Ensure topic ID is valid
                    try {
                      const validTopicId = parseInt(topicId, 10);
                      if (!isNaN(validTopicId) && validTopicId > 0) {
                        options.message_thread_id = validTopicId;
                        debug(`Установлен message_thread_id: ${validTopicId}`);
                      } else {
                        debug(`Некорректный ID топика: ${topicId}, не используем его`);
                      }
                    } catch (e) {
                      debug(`Ошибка при обработке ID топика: ${e.message}`);
                    }
                  }
                  
                  debug(`Отправка документа в Telegram, чат: ${chatId}, опции:`, options);
                  
                  // Use telegramBot.telegram.sendDocument with topic
                  await telegramBot.telegram.sendDocument(
                    chatId,
                    { source: fs.createReadStream(filePath), filename: filename },
                    options
                  );
                  
                  console.log(`Email "${mail.subject}" processed and sent to Telegram${topicId ? ` in topic ${topicId}` : ''}`);
                  debug(`Письмо "${mail.subject}" успешно отправлено в Telegram`);
                } catch (telegramError) {
                  console.error('Error sending document to Telegram:', telegramError);
                  debug('Ошибка отправки в Telegram', {
                    error: telegramError.message,
                    response: telegramError.response,
                    on: telegramError.on
                  });
                  
                  // Попробуем отправить без топика в случае ошибки с thread_id
                  if (telegramError.message && telegramError.message.includes('message thread not found') && options.message_thread_id) {
                    try {
                      debug('Повторная попытка отправки без указания топика');
                      // Create new options without message_thread_id
                      const fallbackOptions = { ...options };
                      delete fallbackOptions.message_thread_id;
                      
                      await telegramBot.telegram.sendDocument(
                        chatId,
                        { source: fs.createReadStream(filePath), filename: filename },
                        fallbackOptions
                      );
                      
                      console.log(`Email "${mail.subject}" sent to Telegram (without topic)`);
                      debug('Письмо успешно отправлено без указания топика');
                    } catch (fallbackError) {
                      console.error('Error sending document to Telegram (fallback):', fallbackError);
                      debug('Ошибка при повторной отправке', fallbackError.message);
                    }
                  }
                }
              } catch (error) {
                console.error('Error processing email:', error);
                debug('Ошибка обработки письма', error.message);
              }
            });
            
            msg.on('body', function(stream, info) {
              debug(`Получение тела письма ${seqno}`);
              stream.pipe(parser);
            });
            
            msg.once('attributes', function(attrs) {
              debug(`Атрибуты письма ${seqno}:`, {
                uid: attrs.uid,
                flags: attrs.flags,
                date: attrs.date
              });
            });
          });
          
          fetch.once('error', function(err) {
            console.error('Fetch error:', err);
            debug('Ошибка получения писем', err);
          });
          
          fetch.once('end', function() {
            debug('Завершена выборка писем');
            console.log('Done fetching messages');
            imap.end();
          });
        });
      });
    });
    
    imap.connect();
  } catch (error) {
    console.error('Email processing error:', error);
    debug('Критическая ошибка обработки писем', error);
    // Don't throw, just log the error
  }
}

/**
 * Extract sender's email address from various formats
 * @param {string|Object} from - From field from email
 * @returns {string} Email address
 */
function extractSenderEmail(from) {
  if (!from) return '';
  
  // Handle string format
  if (typeof from === 'string') {
    const match = from.match(/<([^>]+)>/) || from.match(/([^\s]+@[^\s]+)/);
    return match ? match[1].toLowerCase() : from.toLowerCase();
  }
  
  // Handle object format with address property
  if (from.address) {
    return from.address.toLowerCase();
  }
  
  // Handle array format
  if (Array.isArray(from) && from.length > 0) {
    const firstFrom = from[0];
    if (typeof firstFrom === 'string') {
      return extractSenderEmail(firstFrom);
    } else if (firstFrom.address) {
      return firstFrom.address.toLowerCase();
    }
  }
  
  debug('Не удалось извлечь email отправителя', from);
  return '';
}

/**
 * Extract the text before forwarded message marker if it exists
 * @param {Object} mail - Parsed email object
 * @returns {string|null} The text before the forwarded message marker or null if not found
 */
function extractForwardedText(mail) {
  // Check if there's any text content
  if (!mail.text) {
    return null;
  }
  
  // Look for common forwarded message markers
  const markers = [
    '---------- Forwarded message ---------',
    '---------- Forwarded Message ----------',
    '---------- Forwarded message ----------',
    '---------- Пересланное сообщение ---------',
    '---------- Пересылаемое сообщение ---------'
  ];
  
  // Try each marker
  for (const marker of markers) {
    if (mail.text.includes(marker)) {
      // Extract text before the marker
      const parts = mail.text.split(marker);
      if (parts.length > 1) {
        let textBefore = parts[0].trim();
        if (textBefore) {
          // Нормализация переносов строк для сохранения исходного форматирования
          
          // 1. Заменяем множественные переносы строк на один
          textBefore = textBefore.replace(/\n\s*\n\s*\n+/g, '\n\n');
          
          // 2. Объединяем строки, разбитые при переносе (когда строка заканчивается не на точку или другой знак препинания)
          textBefore = textBefore.replace(/([^\.\,\:\;\!\?\n])\n([a-zа-яё])/gi, '$1 $2');
          
          // 3. Убираем лишние пробелы в начале строк
          textBefore = textBefore.replace(/\n\s+/g, '\n');
          
          // 4. Убираем лишние пробелы между словами
          textBefore = textBefore.replace(/\s{2,}/g, ' ');
          
          return textBefore;
        }
      }
      break; // Found a marker, no need to check others
    }
  }
  
  return null;
}

module.exports = { 
  setupEmailListener, 
  processNewEmails, 
  extractSenderEmail, 
  extractForwardedText 
}; 