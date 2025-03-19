const { Telegraf } = require('telegraf');
const { getWhitelist, addToWhitelist, removeFromWhitelist, isDomainWildcard } = require('../utils/whitelistManager');
const { 
  setDefaultTopic, 
  getDefaultTopic, 
  setTopicForEmail, 
  removeTopicForEmail, 
  getTopicMappings 
} = require('../utils/topicManager');

/**
 * Setup and configure the Telegram bot
 * @returns {Object} Initialized Telegram bot instance
 */
function setupTelegramBot() {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.error('Error: TELEGRAM_BOT_TOKEN not set in environment variables');
      return null;
    }

    const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

    // Handle /start command
    bot.start((ctx) => {
      const defaultTopic = getDefaultTopic();
      const topicStatus = defaultTopic !== null 
        ? `Текущий топик по умолчанию: ID ${defaultTopic}` 
        : 'Топик по умолчанию не установлен. Используйте /set_default_topic ID для настройки.';
      
      ctx.reply(
        'Бот Email2Telegram (v1.3.1) запущен. Он будет пересылать полученные письма с почты bbemailforward@gmail.com в PDF формате.\n\n' +
        'Функциональность:\n' +
        '• Проверка почтового ящика на новые письма\n' +
        '• Конвертация писем в PDF с сохранением оформления\n' +
        '• Фильтрация писем по белому списку отправителей\n' +
        '• Поддержка масок домена (*@domain.com)\n' +
        '• Отправка в разные топики (темы) Telegram\n' +
        '• Отображение комментариев к пересланным письмам\n\n' +
        'Команды управления белым списком:\n' +
        '/whitelist - показать список разрешенных email-адресов\n' +
        '/add email@example.com - добавить email в белый список\n' +
        '/add *@domain.com - добавить все адреса с домена\n' +
        '/remove email@example.com - удалить email из белого списка\n' +
        '/check - проверить новые письма\n\n' +
        'Команды управления топиками:\n' +
        '/topics - показать настройки топиков\n' +
        '/set_default_topic ID - установить топик по умолчанию\n' +
        '/set_topic email@example.com ID - задать топик для email\n' +
        '/remove_topic email@example.com - удалить привязку топика\n' +
        '/test_topic - проверить работу настроенного топика\n\n' +
        `${topicStatus}`
      );
    });

    // Handle /help command
    bot.help((ctx) => {
      ctx.reply(
        'Email2Telegram (v1.3.1) пересылает полученные письма с почты bbemailforward@gmail.com в PDF формате.\n\n' +
        'Функциональность:\n' +
        '• Проверка почтового ящика на новые письма\n' +
        '• Конвертация писем в PDF с сохранением оформления\n' +
        '• Фильтрация писем по белому списку отправителей\n' +
        '• Поддержка масок домена (*@domain.com)\n' +
        '• Отправка в разные топики (темы) Telegram\n' +
        '• Отображение комментариев к пересланным письмам\n\n' +
        'Команды управления белым списком:\n' +
        '/whitelist - показать список разрешенных email-адресов\n' +
        '/add email@example.com - добавить email в белый список\n' +
        '/add *@domain.com - добавить все адреса с домена\n' +
        '/remove email@example.com - удалить email из белого списка\n' +
        '/check - проверить новые письма\n' +
        '/status - проверить статус сервиса\n\n' +
        'Команды управления топиками:\n' +
        '/topics - показать настройки топиков\n' +
        '/set_default_topic ID - установить топик по умолчанию\n' +
        '/clear_default_topic - очистить топик по умолчанию\n' +
        '/set_topic email@example.com ID - задать топик для email\n' +
        '/set_topic *@domain.com ID - задать топик для всех адресов с домена\n' +
        '/remove_topic email@example.com - удалить привязку топика\n' +
        '/test_topic - проверить работу настроенного топика'
      );
    });

    // Handle /status command
    bot.command('status', (ctx) => {
      ctx.reply('Email2Telegram сервис активен и отслеживает новые письма.');
    });

    // Add command to list whitelisted emails
    bot.command('whitelist', (ctx) => {
      const whitelist = getWhitelist();
      
      if (whitelist.length === 0) {
        ctx.reply('Белый список пуст. Все письма будут приниматься.\n\nДля добавления email используйте команду:\n/add email@example.com\n\nИли добавьте все адреса с домена:\n/add *@domain.com');
      } else {
        // Separate normal emails and wildcards for more informative display
        const regularEmails = whitelist.filter(email => !isDomainWildcard(email));
        const wildcardDomains = whitelist.filter(email => isDomainWildcard(email));
        
        let message = 'Список разрешенных email-адресов:\n\n';
        
        if (regularEmails.length > 0) {
          message += 'Конкретные адреса:\n';
          message += regularEmails.map((email, index) => `${index + 1}. ${email}`).join('\n');
          message += '\n\n';
        }
        
        if (wildcardDomains.length > 0) {
          message += 'Домены (все адреса):\n';
          message += wildcardDomains.map((pattern, index) => `${index + 1}. ${pattern} - все письма с домена ${pattern.split('@')[1]}`).join('\n');
          message += '\n\n';
        }
        
        message += 'Для добавления используйте команду:\n/add email@example.com\nили\n/add *@domain.com';
        
        ctx.reply(message);
      }
    });

    // Add command to list topic settings
    bot.command('topics', (ctx) => {
      const defaultTopic = getDefaultTopic();
      const topicMappings = getTopicMappings();
      
      // Check if current chat is the destination chat
      const chatId = ctx.chat.id.toString();
      const configuredChatId = process.env.TELEGRAM_CHAT_ID.toString();
      
      if (chatId !== configuredChatId) {
        ctx.reply(`⚠️ Внимание: Этот чат (ID: ${chatId}) отличается от настроенного чата для получения писем (ID: ${configuredChatId}).\nКоманды будут работать, но вы настраиваете темы для другого чата.`);
      }
      
      // Get current chat info to detect if it has topics
      bot.telegram.getChat(ctx.chat.id).then(chatInfo => {
        const hasTopics = chatInfo.is_forum || false;
        
        if (!hasTopics) {
          ctx.reply('❌ В данном чате не включены темы (topics).\nЧтобы использовать эту функцию, необходимо:\n1. Создать супергруппу\n2. Включить темы в настройках группы\n3. Обновить .env файл с новым TELEGRAM_CHAT_ID');
          return;
        }
        
        let message = 'Настройки топиков для писем:\n\n';
        
        // Default topic info
        message += `Топик по умолчанию: ${defaultTopic !== null ? `ID ${defaultTopic}` : 'не установлен'}\n\n`;
        
        // Topic mappings
        if (Object.keys(topicMappings).length === 0) {
          message += 'Нет настроенных привязок топиков к email-адресам.\n\n';
        } else {
          message += 'Настроенные привязки:\n';
          
          Object.entries(topicMappings).forEach(([email, topicId], index) => {
            const isDomain = email.startsWith('*@');
            const label = isDomain ? `Домен ${email.split('@')[1]}` : `Email ${email}`;
            message += `${index + 1}. ${label} → Топик ID ${topicId}\n`;
          });
          
          message += '\n';
        }
        
        message += 'Команды управления топиками:\n';
        message += '/set_default_topic ID - установить топик по умолчанию\n';
        message += '/clear_default_topic - очистить топик по умолчанию\n';
        message += '/set_topic email@example.com ID - задать топик для email\n';
        message += '/set_topic *@domain.com ID - задать топик для всех адресов с домена\n';
        message += '/remove_topic email@example.com - удалить привязку топика\n\n';
        message += 'ID топика можно узнать, нажав на название темы в этом чате (число в конце URL)';
        
        ctx.reply(message);
      }).catch(error => {
        console.error('Error checking chat info:', error);
        ctx.reply('Ошибка при проверке информации о чате. Проверьте права бота и наличие тем в чате.');
      });
    });

    // Add command to set default topic
    bot.command('set_default_topic', (ctx) => {
      const text = ctx.message.text.trim();
      const parts = text.split(' ');
      
      if (parts.length < 2) {
        ctx.reply('Пожалуйста, укажите ID топика для установки по умолчанию.\nПример: /set_default_topic 123');
        return;
      }
      
      const topicId = parts[1];
      if (!isValidTopicId(topicId)) {
        ctx.reply(`"${topicId}" не является корректным ID топика. ID должен быть положительным числом.`);
        return;
      }
      
      const result = setDefaultTopic(topicId);
      ctx.reply(result.success 
        ? `✅ Топик ID ${topicId} установлен как топик по умолчанию.\nВсе письма без специальных настроек будут отправляться в этот топик.` 
        : `❌ ${result.message}`);
    });

    // Add command to clear default topic
    bot.command('clear_default_topic', (ctx) => {
      const result = setDefaultTopic(null);
      ctx.reply(result.success 
        ? '✅ Топик по умолчанию очищен. Письма без специальных настроек будут отправляться в общий чат.' 
        : `❌ ${result.message}`);
    });

    // Add command to set topic for email or domain
    bot.command('set_topic', (ctx) => {
      const text = ctx.message.text.trim();
      const parts = text.split(' ');
      
      if (parts.length < 3) {
        ctx.reply('Пожалуйста, укажите email/домен и ID топика.\nПример: /set_topic email@example.com 123\nИли: /set_topic *@domain.com 123');
        return;
      }
      
      const emailOrPattern = parts[1].toLowerCase();
      const topicId = parts[2];
      
      // Validate email/pattern
      if (!isValidEmail(emailOrPattern) && !isDomainWildcard(emailOrPattern)) {
        ctx.reply(`"${emailOrPattern}" не является корректным email-адресом или маской домена (*@domain.com).`);
        return;
      }
      
      // Validate topic ID
      if (!isValidTopicId(topicId)) {
        ctx.reply(`"${topicId}" не является корректным ID топика. ID должен быть положительным числом.`);
        return;
      }
      
      const result = setTopicForEmail(emailOrPattern, topicId);
      
      const entityType = isDomainWildcard(emailOrPattern) 
        ? `домена ${emailOrPattern.split('@')[1]}` 
        : `адреса ${emailOrPattern}`;
      
      ctx.reply(result.success 
        ? `✅ Топик ID ${topicId} установлен для ${entityType}.\nПисьма с этого ${isDomainWildcard(emailOrPattern) ? 'домена' : 'адреса'} будут отправляться в указанный топик.` 
        : `❌ ${result.message}`);
    });

    // Add command to remove topic mapping
    bot.command('remove_topic', (ctx) => {
      const text = ctx.message.text.trim();
      const parts = text.split(' ');
      
      if (parts.length < 2) {
        ctx.reply('Пожалуйста, укажите email/домен для удаления привязки к топику.\nПример: /remove_topic email@example.com\nИли: /remove_topic *@domain.com');
        return;
      }
      
      const emailOrPattern = parts[1].toLowerCase();
      
      // Validate email/pattern
      if (!isValidEmail(emailOrPattern) && !isDomainWildcard(emailOrPattern)) {
        ctx.reply(`"${emailOrPattern}" не является корректным email-адресом или маской домена (*@domain.com).`);
        return;
      }
      
      const result = removeTopicForEmail(emailOrPattern);
      
      const entityType = isDomainWildcard(emailOrPattern) 
        ? `домена ${emailOrPattern.split('@')[1]}` 
        : `адреса ${emailOrPattern}`;
      
      ctx.reply(result.success 
        ? `✅ Привязка к топику для ${entityType} удалена.\nПисьма с этого ${isDomainWildcard(emailOrPattern) ? 'домена' : 'адреса'} будут отправляться в топик по умолчанию.` 
        : `❌ ${result.message}. Возможно, для этого ${isDomainWildcard(emailOrPattern) ? 'домена' : 'адреса'} не было настроено привязки к топику.`);
    });

    // Add command to add an email to the whitelist
    bot.command('add', (ctx) => {
      // Extract email from command text
      const text = ctx.message.text.trim();
      const parts = text.split(' ');
      
      if (parts.length < 2) {
        ctx.reply('Пожалуйста, укажите email для добавления в белый список.\nПример: /add email@example.com\nИли для добавления всех адресов с домена: /add *@domain.com');
        return;
      }
      
      const email = parts[1].toLowerCase();
      
      // Check if it's a domain wildcard pattern
      if (isDomainWildcard(email)) {
        // Simplified validation for domain part
        const domain = email.split('@')[1];
        if (!domain || !domain.includes('.') || domain.endsWith('.')) {
          ctx.reply(`"${email}" не является корректным форматом для маски домена. Формат должен быть: *@domain.com`);
          return;
        }
        
        const result = addToWhitelist(email);
        ctx.reply(result.success 
          ? `Маска ${email} успешно добавлена в белый список.\nТеперь принимаются письма от всех адресов с домена ${domain}.\nЧтобы вывести текущий список, используйте команду: /whitelist` 
          : `${result.message}. Возможно, маска ${email} уже находится в белом списке.`);
        return;
      }
      
      // Regular email validation
      if (!isValidEmail(email)) {
        ctx.reply(`"${email}" не является корректным email адресом.`);
        return;
      }
      
      const result = addToWhitelist(email);
      ctx.reply(result.success 
        ? `Email ${email} успешно добавлен в белый список.\nЧтобы вывести текущий список email-адресов, используйте команду: /whitelist` 
        : `${result.message}. Возможно, ${email} уже находится в белом списке.`);
    });

    // Add command to remove an email from the whitelist
    bot.command('remove', (ctx) => {
      // Extract email from command text
      const text = ctx.message.text.trim();
      const parts = text.split(' ');
      
      if (parts.length < 2) {
        ctx.reply('Пожалуйста, укажите email или маску для удаления из белого списка.\nПример: /remove email@example.com\nИли: /remove *@domain.com');
        return;
      }
      
      const email = parts[1].toLowerCase();
      const result = removeFromWhitelist(email);
      
      if (isDomainWildcard(email)) {
        ctx.reply(result.success 
          ? `Маска ${email} успешно удалена из белого списка. Письма с этого домена больше не будут приниматься.` 
          : `${result.message}. Возможно, маска ${email} не находится в белом списке.`);
        return;
      }
      
      ctx.reply(result.success 
        ? `Email ${email} успешно удален из белого списка.` 
        : `${result.message}. Возможно, ${email} не находится в белом списке.`);
    });

    // Add command to check latest emails
    bot.command('check', async (ctx) => {
      ctx.reply('Проверка новых писем...');
      // This will trigger the email check
      try {
        const { processNewEmails } = require('./emailService');
        await processNewEmails(bot);
        ctx.reply('Проверка писем завершена.');
      } catch (error) {
        ctx.reply('Ошибка при проверке писем. Проверьте логи сервера.');
        console.error('Error running email check from Telegram command:', error);
      }
    });

    // Add command to test topic sending
    bot.command('test_topic', async (ctx) => {
      try {
        const defaultTopic = getDefaultTopic();
        const topicMappings = getTopicMappings();
        const chatId = process.env.TELEGRAM_CHAT_ID;
        
        // Подготовка информации о топиках
        let message = 'Информация о настройках топиков:\n\n';
        message += `Топик по умолчанию: ${defaultTopic !== null ? defaultTopic : 'не установлен'}\n`;
        
        if (Object.keys(topicMappings).length > 0) {
          message += '\nНастроенные привязки:\n';
          Object.entries(topicMappings).forEach(([email, topicId], index) => {
            message += `${index + 1}. ${email} → Топик ${topicId}\n`;
          });
        } else {
          message += '\nНет настроенных привязок к email-адресам.';
        }
        
        // Отправляем информацию в обычный чат
        await ctx.reply(message);
        
        // Если есть дефолтный топик, отправляем тестовое сообщение
        if (defaultTopic !== null) {
          try {
            // Пытаемся отправить сообщение в топик
            await bot.telegram.sendMessage(
              chatId,
              `🧪 Тестовое сообщение в топик ID ${defaultTopic}\n\nЕсли вы видите это сообщение, значит топик настроен правильно и сообщения успешно отправляются.`,
              { 
                message_thread_id: defaultTopic,
                parse_mode: 'HTML'
              }
            );
            
            await ctx.reply(`✅ Тестовое сообщение успешно отправлено в топик ID ${defaultTopic}`);
          } catch (topicError) {
            console.error('Error sending test message to topic:', topicError);
            await ctx.reply(`❌ Ошибка отправки сообщения в топик ID ${defaultTopic}: ${topicError.message || 'Неизвестная ошибка'}\n\nВозможно, указан несуществующий ID топика. Проверьте настройки и права бота.`);
          }
        } else {
          await ctx.reply('⚠️ Топик по умолчанию не установлен. Используйте команду /set_default_topic ID для настройки.');
        }
      } catch (error) {
        console.error('Error in test_topic command:', error);
        ctx.reply('Произошла ошибка при выполнении команды.');
      }
    });

    // Handle errors
    bot.catch((err, ctx) => {
      console.error('Telegram bot error:', err);
    });

    // Start the bot
    bot.launch()
      .then(() => {
        console.log('Telegram bot started');
      })
      .catch((error) => {
        console.error('Error starting Telegram bot:', error);
      });

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    return bot;
  } catch (error) {
    console.error('Error initializing Telegram bot:', error);
    return null;
  }
}

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} True if email is valid
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
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

module.exports = { setupTelegramBot }; 