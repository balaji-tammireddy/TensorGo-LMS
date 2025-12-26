import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';

import { errorHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';
import { verifyEmailConnection } from './utils/email';
import { initializeCronJobs } from './utils/cronJobs';

import authRoutes from './routes/auth.routes';
import leaveRoutes from './routes/leave.routes';
import employeeRoutes from './routes/employee.routes';
import profileRoutes from './routes/profile.routes';

import { pool } from './database/db';
import { checkAndCreditMonthlyLeaves } from './services/leaveCredit.service';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploaded assets (e.g. profile photos)
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
app.use('/uploads', express.static(uploadDir));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/profile', profileRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
  });
});

// 🔹 Supabase DB connection test (safe to keep)
(async () => {
  try {
    const res = await pool.query('select now()');
    logger.info(`✅ Supabase DB connected at ${res.rows[0].now}`);
  } catch (err) {
    logger.error('❌ Supabase DB connection failed', err);
  }
})();

// 🔹 Email service connection test
(async () => {
  try {
    const emailConnected = await verifyEmailConnection();
    if (emailConnected) {
      logger.info('✅ Email service connected and ready');
    } else {
      logger.warn('⚠️  Email service not configured or connection failed. Emails will not be sent.');
    }
  } catch (err) {
    logger.error('❌ Email service connection failed', err);
  }
})();

// 🔹 Initialize cron jobs
initializeCronJobs();

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// Schedule daily check for monthly leave credit
// Check every day at 6 AM to see if today is the last working day
const scheduleLeaveCreditCheck = () => {
  // Run immediately on server start to check if it's the last working day
  checkAndCreditMonthlyLeaves().catch(err => {
    logger.error('Initial leave credit check failed:', err);
  });

  // Calculate milliseconds until next 6 AM
  const getMillisecondsUntil6AM = () => {
    const now = new Date();
    const sixAM = new Date(now);
    sixAM.setHours(6, 0, 0, 0); // 6 AM today
    
    // If 6 AM has already passed today, schedule for tomorrow 6 AM
    if (now >= sixAM) {
      sixAM.setDate(sixAM.getDate() + 1);
    }
    
    return sixAM.getTime() - now.getTime();
  };

  // Schedule first check at 6 AM
  const scheduleNextCheck = () => {
    const msUntil6AM = getMillisecondsUntil6AM();
    
    setTimeout(() => {
      // Check if today is the last working day
      checkAndCreditMonthlyLeaves().catch(err => {
        logger.error('Daily leave credit check failed:', err);
      });
      
      // Then check every 24 hours (once per day at 6 AM)
      setInterval(() => {
        checkAndCreditMonthlyLeaves().catch(err => {
          logger.error('Daily leave credit check failed:', err);
        });
      }, 24 * 60 * 60 * 1000); // Check every 24 hours (once per day)
    }, msUntil6AM);
  };

  scheduleNextCheck();
};

// Start the scheduled task
scheduleLeaveCreditCheck();
logger.info('Monthly leave credit scheduler started');

export default app;
