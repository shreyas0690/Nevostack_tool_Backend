const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyRefreshToken,
  extractDeviceInfo,
  validatePassword,
  hashPassword,
  comparePassword,
  authenticateToken
} = require('../middleware/auth');
const { User, Device, Department } = require('../models');
const auditMiddleware = require('../middleware/audit');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    error: 'Too many authentication attempts',
    message: 'Please try again later or contact support if you need assistance.'
  }
});

// Login validation
const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 1 }).withMessage('Password is required'),
  body('rememberMe').optional().isBoolean().withMessage('Remember me must be a boolean'),
  // Allow device info fields (optional)
  body('deviceInfo').optional().isObject(),
  body('deviceInfo.deviceName').optional().isString(),
  body('deviceInfo.touchSupport').optional().isBoolean(),
  body('deviceInfo.webGLSupport').optional().isBoolean(),
  body('deviceInfo.cookieEnabled').optional().isBoolean(),
  body('deviceInfo.doNotTrack').optional().isIn(['0', '1', true, false, null, undefined]).withMessage('DoNotTrack must be 0, 1, or boolean'),
  body('deviceInfo.screenResolution').optional().matches(/^\d+x\d+$/),
  body('deviceInfo.colorDepth').optional().isInt({ min: 1, max: 32 }),
  body('deviceInfo.pixelRatio').optional().isFloat({ min: 0.1, max: 10 })
];

// Register validation
const registerValidation = [
  body('username').isLength({ min: 3, max: 50 }).withMessage('Username must be between 3 and 50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  body('firstName').isLength({ min: 1, max: 50 }).withMessage('First name is required'),
  body('lastName').isLength({ min: 1, max: 50 }).withMessage('Last name is required'),
  body('role').isIn(['super_admin', 'admin', 'hr', 'hr_manager', 'department_head', 'manager', 'member', 'person']).withMessage('Invalid role'),
  body('companyId').optional().isMongoId().withMessage('Invalid company ID')
];

// @route   POST /api/auth/login
// @desc    User login with device tracking
// @access  Public
router.post('/login', authLimiter, loginValidation, async (req, res) => {
  try {


    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: errors.array()[0].msg
      });
    }

    const { email, password, rememberMe = false } = req.body;
    console.log(`🔐 Login attempt for: ${email}`);

    // Find user (include password for comparison)
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      console.warn('Login failed: user not found for email:', email);

      // Log failed login audit (no user found)
      try {
        await require('../services/auditService').createAuditLogWithUser(
          null,
          'login_failed',
          `Failed login attempt for non-existent email: ${email}`,
          {
            userEmail: email,
            userName: 'Unknown User',
            userRole: 'unknown',
            category: 'security',
            severity: 'high',
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            device: extractDeviceInfo(req).deviceType || 'unknown',
            metadata: {
              reason: 'user_not_found',
              attemptedEmail: email
            }
          }
        );
      } catch (auditError) {
        console.error('Failed to log failed login audit:', auditError);
      }

      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Check if account is locked
    if (user.isLocked && user.lockedUntil > new Date()) {
      // Log failed login audit (account locked)
      try {
        await require('../services/auditService').createAuditLogWithUser(
          user._id.toString(),
          'login_failed',
          `Failed login attempt for locked account: ${user.email}`,
          {
            userEmail: user.email,
            userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
            userRole: user.role,
            companyId: user.companyId?.toString(),
            category: 'security',
            severity: 'high',
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            device: extractDeviceInfo(req).deviceType || 'unknown',
            metadata: {
              reason: 'account_locked',
              lockedUntil: user.lockedUntil,
              failedLoginAttempts: user.failedLoginAttempts
            }
          }
        );
      } catch (auditError) {
        console.error('Failed to log locked account audit:', auditError);
      }

      return res.status(423).json({
        error: 'Account locked',
        message: 'Your account is temporarily locked due to multiple failed login attempts.'
      });
    }

    // Verify password
    let isPasswordValid = await comparePassword(password, user.password);

    // Fallback: if bcrypt comparison fails, check if password is stored in plain text
    // (This helps recover users created before hashing was enforced). If plaintext
    // matches, re-hash and save the password to the DB.
    if (!isPasswordValid) {
      try {
        if (user.password === password) {
          // Plaintext match detected. Hash and replace password.
          const hashed = await hashPassword(password);
          user.password = hashed;
          await user.save();
          isPasswordValid = true;
          console.info('Plaintext password detected for user', user.email, '- migrated to hashed password.');
        }
      } catch (migrateErr) {
        console.error('Password migration error for user', user.email, migrateErr);
      }
    }

    if (!isPasswordValid) {
      // Log failed login audit (invalid password)
      try {
        await require('../services/auditService').createAuditLogWithUser(
          user._id.toString(),
          'login_failed',
          `Failed login attempt with invalid password for user: ${user.email}`,
          {
            userEmail: user.email,
            userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
            userRole: user.role,
            companyId: user.companyId?.toString(),
            category: 'security',
            severity: 'high',
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            device: extractDeviceInfo(req).deviceType || 'unknown',
            metadata: {
              reason: 'invalid_password',
              failedLoginAttempts: user.failedLoginAttempts + 1
            }
          }
        );
      } catch (auditError) {
        console.error('Failed to log invalid password audit:', auditError);
      }

      // Increment failed attempts and possibly lock the account
      try {
        await user.incrementFailedLoginAttempts();
        console.warn('Invalid password for user', user.email, '- failedLoginAttempts now', user.failedLoginAttempts + 1);
      } catch (incErr) {
        console.warn('Failed to increment failedLoginAttempts for user', user.email, incErr.message || incErr);
      }

      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Reset failed login attempts on successful login
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLogin = new Date();
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save();

    // Clean up any inactive devices for this user (optional cleanup)
    try {
      await Device.updateMany(
        { 
          userId: user._id, 
          isActive: false,
          tokenExpiry: { $lt: new Date() } // Expired tokens
        },
        {
          accessToken: null,
          refreshToken: null,
          tokenExpiry: null
        }
      );
    } catch (cleanupError) {
      console.warn('Device cleanup failed:', cleanupError.message);
    }

    // Extract device information
    const deviceInfo = extractDeviceInfo(req);

    // Find or create device
    let device = await Device.findOne({
      userId: user._id,
      deviceId: deviceInfo.deviceId
    });

    if (device) {
      // Update existing device
      device.lastActive = new Date();
      device.loginCount += 1;
      device.activity.lastLogin = new Date();
      device.isActive = true;
    } else {
      // Check if user can add more devices
      const activeDevicesCount = await Device.countDocuments({
        userId: user._id,
        isActive: true
      });

      if (activeDevicesCount >= user.securitySettings.maxActiveDevices) {
        return res.status(403).json({
          error: 'Device limit reached',
          message: `You can only have ${user.securitySettings.maxActiveDevices} active devices. Please logout from another device first.`
        });
      }

      // Create new device
      device = new Device({
        userId: user._id,
        ...deviceInfo,
        firstLogin: new Date(),
        loginCount: 1,
        activity: {
          lastLogin: new Date(),
          totalSessionTime: 0,
          pageViews: 0,
          actions: []
        }
      });
    }

    // Generate tokens
    const accessTokenPayload = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      companyId: user.companyId?.toString(),
      deviceId: device.deviceId
    };

    const refreshTokenPayload = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      companyId: user.companyId?.toString(),
      deviceId: device.deviceId
    };

    const accessToken = generateAccessToken(accessTokenPayload);
    const refreshToken = generateRefreshToken(refreshTokenPayload);

    // Save tokens to device
    device.accessToken = accessToken;
    device.refreshToken = refreshToken;
    device.tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    try {
      await device.save();
    } catch (saveError) {
      if (saveError.code === 11000 && saveError.keyPattern?.deviceId) {
        // Handle duplicate deviceId error by updating existing device
        console.log(`📱 Duplicate device detected, updating: ${deviceInfo.deviceId}`);
        
        device = await Device.findOneAndUpdate(
          { deviceId: deviceInfo.deviceId },
          {
            userId: user._id,
            userAgent: deviceInfo.userAgent,
            ipAddress: deviceInfo.ipAddress,
            deviceType: deviceInfo.deviceType,
            browser: deviceInfo.browser,
            os: deviceInfo.os,
            lastActive: new Date(),
            isActive: true,
            $inc: { loginCount: 1 },
            'activity.lastLogin': new Date(),
            accessToken: accessToken,
            refreshToken: refreshToken,
            tokenExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          },
          { 
            new: true, 
            upsert: false,
            runValidators: true 
          }
        );
        
        if (!device) {
          throw new Error('Failed to update existing device');
        }
      } else {
        throw saveError;
      }
    }

    // Set cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000 // 30 days or 7 days
    };

    res.cookie('accessToken', accessToken, cookieOptions);
    res.cookie('refreshToken', refreshToken, cookieOptions);
    res.cookie('deviceId', device.deviceId, cookieOptions);

    // Log successful login audit
    try {
      await require('../services/auditService').createAuditLogWithUser(
        user._id.toString(),
        'login_success',
        `User ${user.firstName} ${user.lastName} (${user.email}) logged in successfully`,
        {
          userEmail: user.email,
          userName: `${user.firstName} ${user.lastName}`,
          userRole: user.role,
          companyId: user.companyId?.toString(),
          companyName: user.companyId ? 'Company' : 'NevoStack Platform', // Will be fetched by service
          category: 'security',
          severity: 'low',
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
          device: device.deviceType || 'unknown',
          location: '', // Can be enhanced later
          metadata: {
            deviceId: device.deviceId,
            browser: device.browser,
            os: device.os,
            loginCount: device.loginCount,
            firstLogin: device.firstLogin
          }
        }
      );
    } catch (auditError) {
      console.error('Failed to log login audit:', auditError);
      // Don't fail login due to audit error
    }

    // Send response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
        avatar: user.avatar,
        status: user.status,
        departmentId: user.departmentId,
        managedMemberIds:user.managedMemberIds,
      },
      device: {
        id: device._id,
        deviceId: device.deviceId,
        deviceName: device.deviceName || `${device.browser} on ${device.os}`,
        deviceType: device.deviceType,
        browser: device.browser,
        os: device.os,
        isTrusted: device.isTrusted,
        firstLogin: device.firstLogin,
        loginCount: device.loginCount
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: rememberMe ? '30d' : '7d'
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken, deviceId: bodyDeviceId } = req.body;
    const cookieDeviceId = req.cookies?.deviceId;
    const deviceId = bodyDeviceId || cookieDeviceId;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Refresh token required',
        message: 'Please provide a refresh token'
      });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({
        error: 'Invalid or expired refresh token',
        message: 'Please login again'
      });
    }

    // Find user
    const user = await User.findById(decoded.id);
    if (!user || user.status !== 'active') {
      return res.status(401).json({
        error: 'User not found or inactive',
        message: 'Your account is not active'
      });
    }

    // Find device (prefer explicit deviceId, but fall back to token match)
    let device = null;
    if (deviceId || decoded.deviceId) {
      device = await Device.findOne({
        userId: user._id,
        deviceId: deviceId || decoded.deviceId,
        isActive: true
      });
    }

    if (!device) {
      device = await Device.findOne({
        userId: user._id,
        refreshToken,
        isActive: true
      });
    }

    if (!device || device.refreshToken !== refreshToken) {
      return res.status(401).json({
        error: 'Invalid device or token mismatch',
        message: 'Please login again'
      });
    }

    // Check if device is locked
    if (device.security?.lockedUntil && device.security.lockedUntil > new Date()) {
      return res.status(423).json({
        error: 'Device is locked',
        message: 'This device has been locked due to security concerns'
      });
    }

    // Update device activity
    device.lastActive = new Date();
    device.activity.actions.push({
      action: 'token_refresh',
      timestamp: new Date()
    });

    // Generate new tokens
    const accessTokenPayload = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      companyId: user.companyId?.toString(),
      deviceId: device.deviceId
    };

    const refreshTokenPayload = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      companyId: user.companyId?.toString(),
      deviceId: device.deviceId
    };

    const newAccessToken = generateAccessToken(accessTokenPayload);
    const newRefreshToken = generateRefreshToken(refreshTokenPayload);

    // Update device tokens
    device.accessToken = newAccessToken;
    device.refreshToken = newRefreshToken;
    device.tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await device.save();

    // Set new cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };

    res.cookie('accessToken', newAccessToken, cookieOptions);
    res.cookie('refreshToken', newRefreshToken, cookieOptions);

    res.status(200).json({
      success: true,
      message: 'Tokens refreshed successfully',
      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: '7d'
      },
      device: {
        id: device._id,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        browser: device.browser,
        os: device.os,
        isTrusted: device.isTrusted,
        lastActive: device.lastActive
      }
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Token refresh failed',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    User logout
// @access  Public (no auth required for logout)
router.post('/logout', async (req, res) => {
  try {
    const { deviceId, logoutAll = false } = req.body;
    
    // Try to get user info from token if available
    let userId = null;
    let currentDeviceId = null;
    
    // Get token from Authorization header or cookies
    let token = req.get('Authorization');
    if (token && token.startsWith('Bearer ')) {
      token = token.slice(7);
    } else {
      token = req.cookies?.accessToken;
    }
    
    // Try to decode token to get user info (even if expired)
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'your-access-secret-key';
        
        // Decode without verification to get user info
        const decoded = jwt.decode(token);
        if (decoded) {
          userId = decoded.id;
          currentDeviceId = decoded.deviceId;
        }
      } catch (decodeError) {
        console.log('Token decode failed during logout:', decodeError.message);
      }
    }
    
    // If no user ID from token, try to get from device
    if (!userId && deviceId) {
      const device = await Device.findOne({ deviceId, isActive: true });
      if (device) {
        userId = device.userId.toString();
        currentDeviceId = deviceId;
      }
    }

    // If we have user ID, proceed with logout
    if (userId) {
      const user = await User.findById(userId);
      if (user) {
    if (logoutAll) {
      // Logout from all devices
      await Device.updateMany(
        { userId: user._id, isActive: true },
        {
          isActive: false,
          'activity.lastLogout': new Date(),
          accessToken: null,
          refreshToken: null,
          tokenExpiry: null
        }
      );
          console.log(`✅ Logged out user ${user.email} from all devices`);
    } else {
      // Logout from specific device
      const targetDeviceId = deviceId || currentDeviceId;
      
          if (targetDeviceId) {
      const device = await Device.findOne({
        userId: user._id,
        deviceId: targetDeviceId,
        isActive: true
      });

      if (device) {
        device.isActive = false;
              device.activity = device.activity || {};
        device.activity.lastLogout = new Date();
        device.accessToken = null;
        device.refreshToken = null;
        device.tokenExpiry = null;
        await device.save();
              console.log(`✅ Logged out user ${user.email} from device ${targetDeviceId}`);
            }
          }
        }
      }
    } else {
      // If no user ID, just clear the specific device if deviceId provided
      if (deviceId) {
        const device = await Device.findOne({ deviceId, isActive: true });
        if (device) {
          device.isActive = false;
          device.activity = device.activity || {};
          device.activity.lastLogout = new Date();
          device.accessToken = null;
          device.refreshToken = null;
          device.tokenExpiry = null;
          await device.save();
          console.log(`✅ Logged out device ${deviceId} (no user ID available)`);
        }
      }
    }

    // Always clear cookies regardless of user/device status
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    res.clearCookie('deviceId', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    // Log logout audit
    try {
      if (userId) {
        const user = await User.findById(userId);
        if (user) {
          await require('../services/auditService').createAuditLogWithUser(
            userId,
            'user_logout',
            `User ${user.firstName} ${user.lastName} (${user.email}) logged out ${logoutAll ? 'from all devices' : 'from device'}`,
            {
              userEmail: user.email,
              userName: `${user.firstName} ${user.lastName}`,
              userRole: user.role,
              companyId: user.companyId?.toString(),
              category: 'security',
              severity: 'low',
              ipAddress: req.ip || req.connection.remoteAddress,
              userAgent: req.get('User-Agent'),
              device: extractDeviceInfo(req).deviceType || 'unknown',
              metadata: {
                logoutAll,
                deviceId: deviceId || currentDeviceId,
                logoutReason: logoutAll ? 'manual_all_devices' : 'manual_single_device'
              }
            }
          );
        }
      } else {
        // Log anonymous logout
        await require('../services/auditService').createAuditLogWithUser(
          null,
          'user_logout',
          `Anonymous logout ${deviceId ? `from device ${deviceId}` : ''}`,
          {
            userEmail: 'anonymous',
            userName: 'Anonymous User',
            userRole: 'unknown',
            category: 'security',
            severity: 'low',
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            device: extractDeviceInfo(req).deviceType || 'unknown',
            metadata: {
              deviceId,
              logoutReason: 'anonymous_logout'
            }
          }
        );
      }
    } catch (auditError) {
      console.error('Failed to log logout audit:', auditError);
      // Don't fail logout due to audit error
    }

    res.status(200).json({
      success: true,
      message: logoutAll ? 'Logged out from all devices' : 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/auth/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    res.status(200).json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Failed to get profile',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
router.post('/register', registerValidation, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: errors.array()[0].msg
      });
    }

    const { username, email, password, firstName, lastName, role, companyId, departmentId } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      return res.status(400).json({
        error: 'User already exists',
        message: 'A user with this email or username already exists'
      });
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: 'Invalid password',
        message: passwordValidation.message
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // If role is department_head, ensure department doesn't already have a head
    if (role === 'department_head' && departmentId) {
      const existingHead = await Department.findOne({ _id: departmentId, headId: { $exists: true, $ne: null } });
      if (existingHead) {
        return res.status(400).json({
          error: 'Department head exists',
          message: 'This department already has a head assigned'
        });
      }
    }

    // Create user
    const user = new User({
      username,
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: role || 'member',
      companyId,
      status: 'active',
      security: {
        lastPasswordChange: new Date(),
        twoFactorEnabled: false,
        emailVerified: false,
        phoneVerified: false
      },
      securitySettings: {
        maxActiveDevices: 5,
        sessionTimeout: 30,
        requireStrongPassword: true
      }
    });

    await user.save();

    // If the created user is a department head, set the department's headId
    if (role === 'department_head' && departmentId) {
      try {
        await Department.findByIdAndUpdate(
          departmentId,
          { headId: user._id },
          { new: true, runValidators: true }
        );
      } catch (err) {
        console.error('Failed to update department head during registration:', err);
        // continue without failing the registration
      }
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
        status: user.status,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/register-company
// @desc    Register new company with admin user
// @access  Public
router.post('/register-company', [
  body('companyName').notEmpty().withMessage('Company name is required'),
  body('companyEmail').isEmail().withMessage('Valid company email is required'),
  body('companyPhone').optional().matches(/^[\+]?[1-9][\d]{0,15}$/).withMessage('Invalid phone number'),
  body('domain').notEmpty().withMessage('Domain is required'),
  body('adminName').notEmpty().withMessage('Admin name is required'),
  body('adminEmail').isEmail().withMessage('Valid admin email is required'),
  body('adminUsername').isLength({ min: 3, max: 50 }).withMessage('Username must be between 3 and 50 characters'),
  body('adminPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  body('address').optional().isObject().withMessage('Address must be an object'),
  body('industry').optional().isString().withMessage('Industry must be a string'),
  body('employeeCount').optional().isString().withMessage('Employee count must be a string')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: errors.array()[0].msg
      });
    }

    const {
      companyName,
      companyEmail,
      companyPhone,
      domain,
      address,
      industry,
      employeeCount,
      adminName,
      adminEmail,
      adminUsername,
      adminPassword
    } = req.body;

    // Import Company and Workspace models
    const { Company, Workspace } = require('../models');
    
    console.log(`🏢 Starting company registration for domain: ${domain}`);
    const existingCompany = await Company.findOne({ domain });
    if (existingCompany) {
      return res.status(400).json({
        error: 'Domain already exists',
        message: 'A company with this domain already exists'
      });
    }

    // Check if company email already exists
    const existingCompanyEmail = await Company.findOne({ email: companyEmail });
    if (existingCompanyEmail) {
      return res.status(400).json({
        error: 'Email already exists',
        message: 'A company with this email already exists'
      });
    }

    // Check if admin user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email: adminEmail }, { username: adminUsername }] 
    });
    
    if (existingUser) {
      return res.status(400).json({
        error: 'Admin user already exists',
        message: 'A user with this email or username already exists'
      });
    }

    // Validate admin password
    const passwordValidation = validatePassword(adminPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: 'Invalid password',
        message: passwordValidation.message
      });
    }

    // Create company first
    const company = new Company({
      name: companyName,
      domain,
      email: companyEmail,
      phone: companyPhone,
      address: address || {},
      status: 'active',
      subscription: {
        plan: 'basic',
        status: 'active',
        startDate: new Date(),
        features: []
      },
      settings: {
        theme: 'default',
        timezone: 'UTC',
        language: 'en',
        notifications: {
          email: true,
          push: true,
          sms: false
        }
      }
    });

    await company.save();
    console.log('Company created successfully:', {
      id: company._id,
      name: company.name,
      domain: company.domain
    });

    // Hash admin password
    const hashedPassword = await hashPassword(adminPassword);

    // Create admin user
    const nameParts = adminName.trim().split(' ');
    const firstName = nameParts[0] || adminName;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'User';

    const adminUser = new User({
      username: adminUsername,
      email: adminEmail,
      password: hashedPassword,
      firstName: firstName,
      lastName: lastName,
      role: 'admin',
      companyId: company._id,
      status: 'active',
      security: {
        lastPasswordChange: new Date(),
        twoFactorEnabled: false,
        emailVerified: false,
        phoneVerified: false
      },
      securitySettings: {
        maxActiveDevices: 5,
        sessionTimeout: 30,
        requireStrongPassword: true
      }
    });

    try {
      await adminUser.save();
      console.log('Admin user created successfully:', {
        id: adminUser._id,
        username: adminUser.username,
        email: adminUser.email,
        companyId: adminUser.companyId
      });

      // Update company stats
      await company.updateStats();
    } catch (userError) {
      console.error('Admin user creation failed:', userError);
      // Clean up: delete the company since user creation failed
      await Company.deleteOne({ _id: company._id });
      console.log('Company cleaned up due to user creation failure');

      return res.status(500).json({
        error: 'User creation failed',
        message: userError.message || 'Failed to create admin user'
      });
    }

    // Create default workspace for the company
    const workspaceName = `${company.name} Workspace`;

    // Extract subdomain from the full domain (e.g., "agamon" from "agamon.nevostack.com")
    const subdomain = domain.split('.')[0];

    console.log(`📋 Creating workspace: ${workspaceName} for ${domain}`);

    try {
      // Check if createWorkspace method exists
      if (!Workspace.createWorkspace) {
        console.error('Workspace.createWorkspace method not found!');
        throw new Error('Workspace creation method not available');
      }

      // Check if Workspace model is properly loaded
      if (!Workspace || typeof Workspace !== 'function') {
        console.error('Workspace model not properly loaded!');
        throw new Error('Workspace model not available');
      }

      console.log('Workspace model validation passed');
      console.log('Starting workspace creation...');

      console.log('Creating workspace with data:', {
        name: workspaceName,
        subdomain: subdomain,
        domain: domain,
        companyId: company._id,
        ownerId: adminUser._id,
        plan: 'starter',
        status: 'trial'
      });

      console.log('Calling Workspace.createWorkspace with data:', {
        name: workspaceName,
        subdomain: subdomain,
        domain: domain,
        companyId: company._id,
        ownerId: adminUser._id,
        plan: 'starter',
        status: 'trial'
      });

      const workspace = await Workspace.createWorkspace({
        name: workspaceName,
        subdomain: subdomain,
        domain: domain, // Use the original domain from company
        companyId: company._id,
        ownerId: adminUser._id,
        plan: 'starter',
        status: 'trial'
      });

      console.log('✅ Workspace creation initiated');
      
      // Verify workspace was saved to database
      try {
        const savedWorkspace = await Workspace.findById(workspace._id);
        if (!savedWorkspace) {
          console.error('Workspace not found in database after creation!');
          throw new Error('Workspace creation failed - not found in database');
        }
        
        console.log('✅ Workspace verified in database:', savedWorkspace._id);
      } catch (dbError) {
        console.error('Database verification error:', dbError);
        console.warn('Continuing without database verification...');
      }
      
      console.log('Workspace created successfully:', {
        id: workspace._id,
        name: workspace.name,
        subdomain: workspace.subdomain,
        domain: workspace.domain
      });
      
      // Validate workspace was actually saved to database
      if (!workspace._id) {
        console.error('Workspace created but no ID returned!');
        throw new Error('Workspace creation failed - no ID returned');
      }
      
      console.log('✅ Workspace successfully saved to database with ID:', workspace._id);

      res.status(201).json({
        success: true,
        message: 'Company, admin user, and workspace created successfully',
        company: {
          id: company._id,
          name: company.name,
          domain: company.domain,
          email: company.email,
          status: company.status,
          subscription: company.subscription,
          createdAt: company.createdAt
        },
        admin: {
          id: adminUser._id,
          username: adminUser.username,
          email: adminUser.email,
          firstName: adminUser.firstName,
          lastName: adminUser.lastName,
          role: adminUser.role,
          companyId: adminUser.companyId,
          createdAt: adminUser.createdAt
        },
        workspace: {
          id: workspace._id,
          name: workspace.name,
          subdomain: workspace.subdomain,
          domain: workspace.domain,
          plan: workspace.plan,
          status: workspace.status,
          trialEndsAt: workspace.trialEndsAt,
          createdAt: workspace.createdAt
        }
      });
    } catch (workspaceError) {
      console.error('Workspace creation failed:', workspaceError);
      console.error('Workspace error details:', {
        message: workspaceError.message,
        stack: workspaceError.stack,
        code: workspaceError.code
      });

      // Clean up: delete both user and company since workspace creation failed
      try {
        await User.deleteOne({ _id: adminUser._id });
        await Company.deleteOne({ _id: company._id });
        console.log('Cleaned up user and company due to workspace creation failure');
      } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError);
      }

      return res.status(500).json({
        error: 'Workspace creation failed',
        message: workspaceError.message || 'Failed to create workspace'
      });
    }

  } catch (error) {
    console.error('Company registration error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    res.status(500).json({
      error: 'Company registration failed',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', authenticateToken, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters long')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: errors.array()[0].msg
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Find user with password
    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await comparePassword(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        error: 'Invalid current password',
        message: 'Current password is incorrect'
      });
    }

    // Validate new password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: 'Invalid password',
        message: passwordValidation.message
      });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    user.password = hashedPassword;
    user.lastPasswordChange = new Date();
    await user.save();

    // Logout from all devices except current
    await Device.updateMany(
      { 
        userId: user._id, 
        isActive: true,
        deviceId: { $ne: req.user.deviceId }
      },
      {
        isActive: false,
        'activity.lastLogout': new Date(),
        accessToken: null,
        refreshToken: null,
        tokenExpiry: null
      }
    );

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. You have been logged out from other devices.'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      error: 'Failed to change password',
      message: 'Internal server error'
    });
  }
});

module.exports = router;




