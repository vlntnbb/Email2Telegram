const puppeteer = require('puppeteer');

/**
 * Convert an email to a PDF document
 * @param {Object} email - Parsed email object from mail-parser
 * @returns {Buffer} PDF file as buffer
 */
async function convertEmailToPdf(email) {
  // Launch a headless browser
  const browser = await puppeteer.launch({ 
    headless: true, // Use true instead of 'new' for older puppeteer versions
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-web-security', // Allow loading of external content
      '--disable-features=IsolateOrigins,site-per-process' // Disable site isolation
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Process embedded images (cid: images)
    const { htmlContent, embeddedImages } = processEmailContent(email);
    
    // Configure request interception for handling images correctly
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      
      // Allow data URLs (embedded images)
      if (url.startsWith('data:')) {
        request.continue();
        return;
      }
      
      // Handle CID (Content-ID) image references
      if (url.startsWith('cid:')) {
        const cid = url.substring(4); // Remove 'cid:' prefix
        if (embeddedImages[cid]) {
          request.respond({
            status: 200,
            contentType: embeddedImages[cid].contentType || 'image/jpeg',
            body: embeddedImages[cid].content
          });
          return;
        }
      }
      
      // Allow images and required resources, block potentially problematic ones
      if (request.resourceType() === 'image' || 
          url.endsWith('.jpg') || 
          url.endsWith('.jpeg') || 
          url.endsWith('.png') || 
          url.endsWith('.gif') || 
          url.endsWith('.svg')) {
        request.continue();
      } else if (request.resourceType() === 'font' ||
                request.resourceType() === 'media' ||
                request.resourceType() === 'script') {
        // Continue (allow) basic resources
        request.continue();
      } else if (request.resourceType() === 'xhr' ||
                request.resourceType() === 'fetch' ||
                request.resourceType() === 'websocket') {
        // Block potentially long-running network requests
        request.abort();
      } else {
        // Continue with other resource types
        request.continue();
      }
    });
    
    // Set longer timeout
    page.setDefaultNavigationTimeout(60000); // 60 seconds
    
    // Set content to page with appropriate waiting condition
    await page.setContent(htmlContent, { 
      waitUntil: 'networkidle2', // Wait until network is mostly idle
      timeout: 60000 // 60 seconds timeout
    });
    
    // Wait a moment for images to load
    await page.waitForTimeout(2000);
    
    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px',
      },
      timeout: 60000 // 60 seconds timeout
    });
    
    return pdfBuffer;
  } catch (error) {
    console.error('Error generating PDF:', error);
    
    // Fallback to simple text-only PDF if HTML conversion fails
    try {
      console.log('Attempting fallback to simple PDF generation...');
      const page = await browser.newPage();
      
      // Create simple text version
      const textContent = createSimpleTextEmail(email);
      await page.setContent(textContent, { waitUntil: 'domcontentloaded' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
      });
      
      return pdfBuffer;
    } catch (fallbackError) {
      console.error('Fallback PDF generation failed:', fallbackError);
      throw error; // Throw the original error
    }
  } finally {
    await browser.close();
  }
}

/**
 * Process email content to handle embedded images
 * @param {Object} email - Parsed email object
 * @returns {Object} Object containing HTML content and embedded images map
 */
function processEmailContent(email) {
  // Generate the HTML content first
  let htmlContent = createEmailHtml(email);
  const embeddedImages = {};
  
  // Process attachments to find inline images
  if (email.attachments && email.attachments.length > 0) {
    email.attachments.forEach(attachment => {
      if (attachment.contentId) {
        // Store the embedded image by its content ID
        const cid = attachment.contentId.replace(/[<>]/g, '');
        embeddedImages[cid] = {
          content: attachment.content,
          contentType: attachment.contentType
        };
        
        // If images are accessed directly via cid:, convert them to data URLs
        if (attachment.content) {
          const dataUrl = `data:${attachment.contentType};base64,${attachment.content.toString('base64')}`;
          // Replace all occurrences of cid: references with data URLs
          const cidPattern = new RegExp(`cid:${cid}`, 'g');
          htmlContent = htmlContent.replace(cidPattern, dataUrl);
        }
      }
    });
  }
  
  return { htmlContent, embeddedImages };
}

/**
 * Create a simple text-only version of the email for fallback
 * @param {Object} email - Parsed email object
 * @returns {string} Simple HTML content
 */
function createSimpleTextEmail(email) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(email.subject || 'No Subject')}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        pre { white-space: pre-wrap; }
      </style>
    </head>
    <body>
      <h2>${escapeHtml(email.subject || 'No Subject')}</h2>
      <p><strong>From:</strong> ${escapeHtml(formatSender(email.from))}</p>
      <p><strong>To:</strong> ${escapeHtml(formatRecipients(email.to))}</p>
      <p><strong>Date:</strong> ${new Date(email.date || Date.now()).toLocaleString()}</p>
      <hr>
      <pre>${escapeHtml(email.text || '')}</pre>
    </body>
    </html>
  `;
}

/**
 * Create HTML content from email object
 * @param {Object} email - Parsed email object
 * @returns {string} HTML content
 */
function createEmailHtml(email) {
  // Extract attachments info
  const attachments = email.attachments || [];
  const attachmentsList = attachments.map(att => 
    `<li>${att.fileName || 'Attachment'} (${formatBytes(att.length || 0)})</li>`
  ).join('');

  // Create HTML content
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(email.subject || 'No Subject')}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          margin: 0;
          padding: 20px;
          color: #333;
        }
        .email-container {
          max-width: 800px;
          margin: 0 auto;
          border: 1px solid #ddd;
          border-radius: 5px;
          overflow: hidden;
        }
        .email-header {
          background-color: #f5f5f5;
          padding: 15px;
          border-bottom: 1px solid #ddd;
        }
        .email-subject {
          margin: 0 0 10px 0;
          font-size: 20px;
          color: #333;
        }
        .email-meta {
          font-size: 14px;
          color: #666;
          margin-bottom: 5px;
        }
        .email-body {
          padding: 20px;
          background-color: white;
        }
        .email-attachments {
          padding: 15px;
          background-color: #f9f9f9;
          border-top: 1px solid #ddd;
        }
        .email-attachments h4 {
          margin-top: 0;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="email-header">
          <h1 class="email-subject">${escapeHtml(email.subject || 'No Subject')}</h1>
          <div class="email-meta">
            <strong>From:</strong> ${escapeHtml(formatSender(email.from))}
          </div>
          <div class="email-meta">
            <strong>To:</strong> ${escapeHtml(formatRecipients(email.to))}
          </div>
          ${email.cc ? `<div class="email-meta"><strong>Cc:</strong> ${escapeHtml(formatRecipients(email.cc))}</div>` : ''}
          <div class="email-meta">
            <strong>Date:</strong> ${new Date(email.date || Date.now()).toLocaleString()}
          </div>
        </div>
        <div class="email-body">
          ${email.html || escapeHtml(email.text || '').replace(/\n/g, '<br>')}
        </div>
        ${attachments.length > 0 ? `
        <div class="email-attachments">
          <h4>Attachments (${attachments.length}):</h4>
          <ul>${attachmentsList}</ul>
        </div>` : ''}
      </div>
    </body>
    </html>
  `;
}

/**
 * Format bytes to human-readable size
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format sender information
 * @param {Object|string} from - From field from email
 * @returns {string} Formatted sender string
 */
function formatSender(from) {
  if (!from) return 'Unknown';
  
  // Handle mail-parser format
  if (typeof from === 'string') {
    return from;
  }
  
  // Try to handle different formats
  if (from.address) {
    return from.name ? `${from.name} <${from.address}>` : from.address;
  }
  
  // If it's an array
  if (Array.isArray(from)) {
    const sender = from[0];
    if (sender) {
      return sender.name ? `${sender.name} <${sender.address}>` : sender.address;
    }
  }
  
  return 'Unknown';
}

/**
 * Format recipients information
 * @param {Array|string} recipients - Recipients field from email
 * @returns {string} Formatted recipients string
 */
function formatRecipients(recipients) {
  if (!recipients) return '';
  
  // Handle mail-parser format (string)
  if (typeof recipients === 'string') {
    return recipients;
  }
  
  // Handle array format
  if (Array.isArray(recipients)) {
    return recipients.map(recipient => {
      if (typeof recipient === 'string') return recipient;
      return recipient.name ? `${recipient.name} <${recipient.address}>` : recipient.address;
    }).join(', ');
  }
  
  return '';
}

/**
 * Escape HTML special characters
 * @param {string} text - Input text
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
  if (!text) return '';
  
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = { convertEmailToPdf }; 