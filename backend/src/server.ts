import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';

import { errorHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';

import authRoutes from './routes/auth.routes';
import leaveRoutes from './routes/leave.routes';
import employeeRoutes from './routes/employee.routes';
import profileRoutes from './routes/profile.routes';
import notificationRoutes from './routes/notification.routes';

import { pool } from './database/db';

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
app.use('/api/notifications', notificationRoutes);

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

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

export default app;
