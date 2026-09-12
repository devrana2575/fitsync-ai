const nodemailer = require('nodemailer');
const twilio = require('twilio');

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  });
}

let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

const sendEmail = async ({ to, subject, text, html }) => {
  if (!transporter) {
    console.log(`[Email] (not configured) To: ${to} | Subject: ${subject}`);
    return false;
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'FitSync AI <no-reply@fitsync.ai>',
      to,
      subject,
      text,
      html: html || text
    });
    return true;
  } catch (error) {
    console.error('[Email] Failed:', error.message);
    return false;
  }
};

const sendSms = async ({ to, body }) => {
  if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER || !to) {
    console.log(`[SMS] (not configured) To: ${to} | ${body}`);
    return false;
  }
  try {
    await twilioClient.messages.create({ to, from: process.env.TWILIO_PHONE_NUMBER, body });
    return true;
  } catch (error) {
    console.error('[SMS] Failed:', error.message);
    return false;
  }
};

const EMAIL_WORTHY = new Set(['membership_expiry', 'high_risk', 'progress_anomaly', 'payment_due', 'announcement']);
const SMS_WORTHY = new Set(['membership_expiry', 'high_risk', 'class_update']);

const dispatchMessage = async (user, notification) => {
  try {
    if (!user || !notification) return;
    const prefs = user.preferences || {};

    if (prefs.emailNotifications !== false && EMAIL_WORTHY.has(notification.type)) {
      sendEmail({
        to: user.email,
        subject: `[FitSync AI] ${notification.title}`,
        text: notification.message
      });
    }

    if (prefs.smsNotifications === true && SMS_WORTHY.has(notification.type)) {
      const phone = user.phone;
      if (phone) {
        sendSms({
          to: phone,
          body: `[FitSync AI] ${notification.title}: ${notification.message}`
        });
      }
    }
  } catch (error) {
    console.error('[Messaging] Error:', error.message);
  }
};

module.exports = { sendEmail, sendSms, dispatchMessage };