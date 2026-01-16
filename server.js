const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const path = require('path');
const fs = require('fs');
const http = require('http');
require('dotenv').config();

// Import WebSocket
const { initializeWebSocket, sendNotificationToUser, sendNotificationToCompany, sendUnreadCountUpdate } = require('./websocket');

// Import routes
const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const userRoutes = require('./routes/users');
const companyRoutes = require('./routes/companies');
const departmentRoutes = require('./routes/departments');
const attendanceRoutes = require('./routes/attendance');
const leaveRoutes = require('./routes/leaves');
const meetingRoutes = require('./routes/meetings');
const taskRoutes = require('./routes/tasks');
const notificationRoutes = require('./routes/notifications');
const systemNotificationRoutes = require('./routes/system-notifications');
const workspaceRoutes = require('./routes/workspaces');
const analyticsRoutes = require('./routes/analytics');
const reportsRoutes = require('./routes/reports');
const managerRoutes = require('./routes/manager');
const memberRoutes = require('./routes/members');
const hodRoutes = require('./routes/hod');
const hrRoutes = require('./routes/hr');
const saasRoutes = require('./routes/saas');
const companyRegistrationRoutes = require('./routes/company-registration');
const billingRoutes = require('./routes/billing');
const couponRoutes = require('./routes/coupons');

// Upload middleware will be set after upload configuration

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Set global timeout for requests (5 minutes for file uploads)
app.use((req, res, next) => {
  req.setTimeout(300000); // 5 minutes
  res.setTimeout(300000); // 5 minutes
  next();
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:8080'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Origin',
    'Accept',
    'Cache-Control',
    'Pragma',
    'Expires',
    'X-Filters',
    'X-Device-Id',
    'X-Refresh-Token'
  ],
  exposedHeaders: [
    'X-New-Access-Token',
    'X-New-Refresh-Token',
    'X-Token-Refreshed'
  ],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
const companyLogosDir = path.join(uploadsDir, 'company-logos');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(companyLogosDir)) {
  fs.mkdirSync(companyLogosDir, { recursive: true });
}

// Serve static files from uploads directory
app.use('/uploads', express.static(uploadsDir));

// Rate limiting - General API (more lenient for HOD panel)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 500, // Increased to 500 requests per windowMs for HOD panel
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(parseInt(process.env.RATE_LIMIT_WINDOW_MS) / 1000 / 60)
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for HOD-related endpoints
  skip: (req) => {
    return req.path.startsWith('/api/analytics/') ||
      req.path.startsWith('/api/departments/') ||
      req.path.startsWith('/api/tasks/') ||
      req.path.startsWith('/api/users/') ||
      req.path.startsWith('/api/leaves/') ||
      req.path.startsWith('/api/meetings/');
  }
});

// HOD Panel specific rate limiting - Very lenient for dashboard usage
const hodPanelLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1000, // Allow 1000 requests per 5 minutes for HOD panel
  message: {
    error: 'Too many HOD panel requests, please wait a moment.',
    retryAfter: 5
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Analytics-specific rate limiting - More lenient for dashboard usage
const analyticsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 500, // Allow 500 requests per 5 minutes for analytics
  message: {
    error: 'Too many analytics requests, please wait a moment.',
    retryAfter: 5
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Speed limiting - Much more lenient for HOD panel
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 200, // Increased from 100 to 200 requests per 15 minutes
  delayMs: () => 100, // Reduced delay from 200ms to 100ms
  validate: { delayMs: false } // disable warning
});

app.use(limiter);
app.use(speedLimiter);

// Body parsing middleware
// Skip the JSON/urlencoded parsers for multipart/form-data requests to avoid parse errors
app.use((req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (typeof ct === 'string' && ct.includes('multipart/form-data')) {
    // Let multer or other multipart handlers process this request in route handlers
    return next();
  }

  // Otherwise use express.json and express.urlencoded as usual
  express.json({ limit: '10mb' })(req, res, (err) => {
    if (err) return next(err);
    express.urlencoded({ extended: true, limit: '10mb' })(req, res, next);
  });
});
app.use(cookieParser());

// Compression middleware
app.use(compression());

// Logging middleware - cleaner format
if (process.env.NODE_ENV === 'development') {
  app.use(morgan(':method :url :status :response-time ms'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'NevoStack Backend API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '1.0.0'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/devices', authenticateToken, deviceRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/companies', authenticateToken, companyRoutes);
app.use('/api/departments', authenticateToken, departmentRoutes);
app.use('/api/attendance', authenticateToken, attendanceRoutes);
app.use('/api/leaves', authenticateToken, leaveRoutes);
app.use('/api/meetings', authenticateToken, meetingRoutes);
app.use('/api/tasks', authenticateToken, taskRoutes);
app.use('/api/notifications', authenticateToken, notificationRoutes);
app.use('/api/system-notifications', authenticateToken, systemNotificationRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/analytics', authenticateToken, analyticsRoutes);
app.use('/api/reports', authenticateToken, reportsRoutes);
// Manager routes (dashboard)
app.use('/api/manager', authenticateToken, managerRoutes);
// Member routes (dashboard)
app.use('/api/members', authenticateToken, memberRoutes);
// HOD routes (dashboard)
app.use('/api/hod', authenticateToken, hodRoutes);
// HR routes (dashboard)
app.use('/api/hr', authenticateToken, hrRoutes);
// SaaS Super Admin routes
app.use('/api/saas', authenticateToken, saasRoutes);
// Company Registration routes (public - no auth required)
app.use('/api/company', companyRegistrationRoutes);
// Billing routes (authenticated)
app.use('/api/billing', authenticateToken, billingRoutes);
app.use('/api/coupons', couponRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use(errorHandler);

// Import database connection
const { connectDB } = require('./lib/mongodb');

// Start server
const startServer = async () => {
  try {
    await connectDB();

    // Create HTTP server
    const server = http.createServer(app);

    // Initialize WebSocket
    initializeWebSocket(server);

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
      console.log(`🔌 WebSocket enabled for real-time notifications`);
    });
  } catch (error) {
    console.error('Server startup error:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  mongoose.connection.close(() => {
    console.log('MongoDB connection closed');
    process.exit(0);
  });
});

startServer();

module.exports = app;


