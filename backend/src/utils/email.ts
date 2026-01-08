import nodemailer from 'nodemailer';
import { logger } from './logger';

// Create reusable transporter
let transporter: nodemailer.Transporter | null = null;
let isInitialized = false;

/**
 * Get email configuration from environment variables (reads fresh each time)
 */
const getEmailConfig = () => {
  return {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD, // Gmail App Password
    },
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    fromName: process.env.EMAIL_FROM_NAME || 'TensorGo Intranet',
  };
};

/**
 * Initialize email service with Gmail SMTP
 * @returns nodemailer.Transporter | null
 */
export const initializeEmailService = (): nodemailer.Transporter | null => {
  // Re-read environment variables in case they were loaded after module import
  const emailConfig = getEmailConfig();

  // Validate required email configuration
  if (!emailConfig.auth.user || !emailConfig.auth.pass) {
    logger.warn('⚠️  Email service not configured. Missing SMTP credentials in environment variables.', {
      hasUser: !!emailConfig.auth.user,
      hasPass: !!emailConfig.auth.pass,
    });
    transporter = null;
    isInitialized = false;
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      auth: {
        user: emailConfig.auth.user,
        pass: emailConfig.auth.pass,
      },
      tls: {
        // Allow self-signed certificates and handle expired certificates by default
        // This is important for development and some SMTP servers
        // Set SMTP_REJECT_UNAUTHORIZED=true in .env to enforce strict certificate validation
        // Default is false to allow expired/self-signed certificates
        rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED === 'true' ? true : false,
      },
      // For port 587 (TLS), use requireTLS
      requireTLS: emailConfig.port === 587,
    });

    logger.info('✅ Email service initialized successfully');
    isInitialized = true;
    return transporter;
  } catch (error) {
    logger.error('❌ Failed to initialize email service:', error);
    transporter = null;
    isInitialized = false;
    return null;
  }
};

/**
 * Ensure email service is initialized (lazy initialization)
 */
const ensureInitialized = (): boolean => {
  // If already initialized and transporter exists, return true
  if (isInitialized && transporter) {
    return true;
  }

  // Try to initialize
  const result = initializeEmailService();
  return result !== null && transporter !== null;
};

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: string | Buffer;
    contentType?: string;
  }>;
}

/**
 * Send an email
 * @param options Email options
 * @returns Promise<boolean> - true if sent successfully, false otherwise
 */
export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  // Ensure email service is initialized before sending
  if (!ensureInitialized()) {
    logger.error('Email service not initialized. Cannot send email.');
    return false;
  }

  if (!transporter) {
    logger.error('Email service not initialized. Cannot send email.');
    return false;
  }

  // Get fresh config for from address
  const emailConfig = getEmailConfig();

  try {
    // Generate a unique Message-ID to ensure each email is treated as a new thread
    // Use timestamp + random string to ensure uniqueness
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const domain = emailConfig.from?.split('@')[1] || 'gmail.com';
    const messageId = `<${timestamp}-${randomId}@${domain}>`;

    // Build headers object to ensure each email is a new message (not a reply)
    // Gmail threads aggressively, so we need multiple strategies
    const headers: { [key: string]: string } = {
      'Message-ID': messageId,
      'X-Priority': '3',        // Normal priority
      'X-MSMail-Priority': 'Normal',
      'X-Auto-Response-Suppress': 'All', // Prevent auto-replies
      'X-Entity-Ref-ID': `${timestamp}-${randomId}`, // Unique reference to prevent threading
      'Thread-Index': `A${timestamp}${randomId}`, // Microsoft threading prevention
      'X-Threading': 'no', // Custom header to indicate no threading
      // Explicitly do not set In-Reply-To or References to prevent threading
    };

    const mailOptions: any = {
      from: `"${emailConfig.fromName}" <${emailConfig.from}>`,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || (options.html ? undefined : 'No text content provided'),
      cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
      bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
      attachments: options.attachments,
      headers: headers,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`✅ Email sent successfully to ${options.to}: ${info.messageId}`);
    return true;
  } catch (error) {
    logger.error(`❌ Failed to send email to ${options.to}:`, error);
    return false;
  }
};

/**
 * Verify email service connection
 * @returns Promise<boolean> - true if connection is valid
 */
export const verifyEmailConnection = async (): Promise<boolean> => {
  // Ensure email service is initialized before verifying
  if (!ensureInitialized()) {
    return false;
  }

  if (!transporter) {
    return false;
  }

  try {
    await transporter.verify();
    logger.info('✅ Email service connection verified');
    return true;
  } catch (error) {
    logger.error('❌ Email service connection verification failed:', error);
    return false;
  }
};

/**
 * Get email service status
 */
export const getEmailServiceStatus = (): { initialized: boolean; configured: boolean } => {
  const emailConfig = getEmailConfig();
  return {
    initialized: transporter !== null && isInitialized,
    configured: !!(emailConfig.auth.user && emailConfig.auth.pass),
  };
};

