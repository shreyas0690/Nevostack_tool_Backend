const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

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

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');

const app = express();

// MongoDB connection for serverless
let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;

    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('MONGODB_URI environment variable is not set');
        }

        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        isConnected = true;
        console.log('✅ MongoDB connected (Vercel)');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        throw error;
    }
};

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
}));

// CORS configuration
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8080',
        process.env.FRONTEND_URL
    ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Origin',
        'Accept',
        'Cache-Control',
        'X-Device-Id',
        'X-Refresh-Token'
    ],
    exposedHeaders: [
        'X-New-Access-Token',
        'X-New-Refresh-Token',
        'X-Token-Refreshed'
    ],
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(compression());

// Connect to DB before handling requests
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        res.status(500).json({ error: 'Database connection failed' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'NevoStack Backend API (Vercel)',
        timestamp: new Date().toISOString(),
    });
});

app.get('/', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'NevoStack Backend API is running on Vercel',
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
app.use('/api/manager', authenticateToken, managerRoutes);
app.use('/api/members', authenticateToken, memberRoutes);
app.use('/api/hod', authenticateToken, hodRoutes);
app.use('/api/hr', authenticateToken, hrRoutes);
app.use('/api/saas', authenticateToken, saasRoutes);
app.use('/api/company', companyRegistrationRoutes);
app.use('/api/billing', authenticateToken, billingRoutes);
app.use('/api/coupons', couponRoutes);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        message: `Cannot ${req.method} ${req.originalUrl}`,
    });
});

// Error handling
app.use(errorHandler);

module.exports = app;
