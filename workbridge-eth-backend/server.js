require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { connectDB, closeDB } = require('./config/database');
const { migrate } = require('./config/migrate');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// ---------- Fail fast on weak config ----------
const DEFAULT_SECRETS = [
  'your_super_secret_jwt_key_change_this_in_production',
  'your_super_secret_key',
  'change_me',
  'secret'
];
if (!process.env.JWT_SECRET || DEFAULT_SECRETS.includes(process.env.JWT_SECRET)) {
  console.error('❌ FATAL: JWT_SECRET is missing or still set to a default value.');
  console.error('   Set a strong random value in .env (e.g. `openssl rand -base64 48`).');
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('❌ FATAL: JWT_SECRET must be at least 32 characters.');
  process.exit(1);
}

// ---------- App ----------
const app = express();

// Trust the first proxy (needed for correct client IPs behind nginx/cloudflare)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(compression());

// General rate limit (per IP). /api/auth has its own tighter limiter in routes/auth.js
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

// CORS
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin (curl, server-to-server) and matching origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'WorkBridge ETH API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/services', require('./routes/services'));
app.use('/api/dating', require('./routes/dating'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));

// 404 + error handler
app.use(notFound);
app.use(errorHandler);

// ---------- Start ----------
const PORT = parseInt(process.env.PORT, 10) || 5000;

const startServer = async () => {
  try {
    await connectDB();
    // Run idempotent migration on boot. Cheap when nothing to do.
    await migrate();
    console.log('✅ Migrations applied');
    const server = app.listen(PORT, () => {
      console.log(`\n🚀 WorkBridge ETH Server running on port ${PORT}`);
      console.log(`📡 API Base URL: http://localhost:${PORT}/api`);
      console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}\n`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n${signal} received, shutting down...`);
      server.close(async () => {
        try { await closeDB(); } catch (e) { console.error('Error closing DB:', e); }
        process.exit(0);
      });
      // Hard kill after 10s
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

// Last-resort crash safety
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

startServer();
