// Force reload to pick up service changes - v16
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

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
import policyRoutes from './routes/policy.routes';
import dashboardRoutes from './routes/dashboard.routes';
import leaveRuleRoutes from './routes/leaveRule.routes';
import projectRoutes from './routes/projectRoutes';
import timesheetRoutes from './routes/timesheet.routes';

import { pool } from './database/db';
import { checkAndCreditMonthlyLeaves } from './services/leaveCredit.service';

import cookieParser from 'cookie-parser';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Global Middleware
app.use(helmet());
app.use(compression()); // Enable Gzip compression
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Allow any localhost/127.0.0.1 origin for development
      if (process.env.NODE_ENV !== 'production' && (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))) {
        return callback(null, true);
      }

      // Check against configured frontend URLs
      const allowedOrigins = [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        'http://51.15.227.10:3000',
        'http://intra.tensorgo.com'
      ];

      if (origin === allowedOrigins[0] || origin === 'http://51.15.227.10:3000' || origin === 'http://intra.tensorgo.com') {
        return callback(null, true);
      }

      logger.warn(`Blocked by CORS: Origin '${origin}' does not match allowed origin '${allowedOrigins[0]}'`);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(cookieParser());

// Rate limiting removed
// const limiter = rateLimit({ ... });
// app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploaded assets (e.g. profile photos)
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
app.use('/uploads', express.static(uploadDir, {
  maxAge: '1d', // Cache static assets for 1 day
  immutable: true
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/leave-rules', leaveRuleRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/timesheets', timesheetRoutes);

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

// Schedule daily check for monthly leave credit and year-end carry forward
// Check every day at 8 PM to see if today is the last working day
// IMPORTANT: Leaves are ONLY credited at 8 PM, never before
const scheduleLeaveCreditCheck = () => {
  // Calculate milliseconds until next 8 PM
  const getMillisecondsUntil8PM = () => {
    const now = new Date();
    const eightPM = new Date(now);
    eightPM.setHours(20, 0, 0, 0); // 8 PM today (20:00)
    eightPM.setMinutes(0);
    eightPM.setSeconds(0);
    eightPM.setMilliseconds(0);

    // If 8 PM has already passed today, schedule for tomorrow 8 PM
    if (now >= eightPM) {
      eightPM.setDate(eightPM.getDate() + 1);
    }

    const msUntil8PM = eightPM.getTime() - now.getTime();
    logger.info(`Next leave credit check scheduled for ${eightPM.toISOString()} (in ${Math.round(msUntil8PM / 1000 / 60)} minutes)`);
    return msUntil8PM;
  };

  // Schedule first check at 8 PM
  const scheduleNextCheck = () => {
    const msUntil8PM = getMillisecondsUntil8PM();

    setTimeout(() => {
      // Verify it's actually 8 PM before processing
      const now = new Date();
      const currentHour = now.getHours();

      if (currentHour === 20) {
        // It's 8 PM, check if today is the last working day
        logger.info(`8 PM detected. Checking if today is the last working day for leave credit...`);
        checkAndCreditMonthlyLeaves().catch(err => {
          logger.error('Daily leave credit check failed:', err);
        });
      } else {
        logger.warn(`Scheduled check triggered at hour ${currentHour} (not 8 PM). Skipping leave credit.`);
      }

      // Then check every 24 hours (once per day at 8 PM)
      setInterval(() => {
        const checkTime = new Date();
        const checkHour = checkTime.getHours();

        if (checkHour === 20) {
          // It's 8 PM, check if today is the last working day
          logger.info(`8 PM detected. Checking if today is the last working day for leave credit...`);
          checkAndCreditMonthlyLeaves().catch(err => {
            logger.error('Daily leave credit check failed:', err);
          });
        } else {
          logger.warn(`Scheduled check triggered at hour ${checkHour} (not 8 PM). Skipping leave credit.`);
        }
      }, 24 * 60 * 60 * 1000); // Check every 24 hours (once per day)
    }, msUntil8PM);
  };

  scheduleNextCheck();
  logger.info('Monthly leave credit scheduler initialized. Will only run at 8 PM.');
};

// Start the scheduled task
scheduleLeaveCreditCheck();
logger.info('Monthly leave credit scheduler started');

export default app;
