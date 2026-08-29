const nodemailer = require('nodemailer');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  // If no SMTP creds, log to console (useful in dev).
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn('⚠️  SMTP not configured — emails will be logged to console');
    transporter = {
      sendMail: async ({ to, subject, html }) => {
        console.log('\n📧 [DEV EMAIL] To:', to);
        console.log('   Subject:', subject);
        // Print just the text content, not the full HTML, to keep logs readable.
        const text = (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        console.log('   Body:', text.slice(0, 200) + (text.length > 200 ? '...' : ''), '\n');
        return { messageId: 'dev-' + Date.now() };
      }
    };
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  return transporter;
};

const sendEmail = async ({ to, subject, html, text }) => {
  const t = getTransporter();
  const from = process.env.SMTP_FROM || `WorkBridge ETH <${process.env.SMTP_USER || 'noreply@workbridge.local'}>`;
  return t.sendMail({ from, to, subject, html, text });
};

module.exports = { sendEmail };
