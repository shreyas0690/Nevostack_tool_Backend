const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User, Device } = require('../models');

// JWT Secret Keys
const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'your-access-secret-key';
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';

// Token expiration times
const ACCESS_TOKEN_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

// Generate Access Token
const generateAccessToken = (payload) => {
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
};

// Generate Refresh Token
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
};

// Verify Access Token
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, ACCESS_TOKEN_SECRET);
  } catch (error) {
    return null;
  }
};

// Verify Refresh Token
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, REFRESH_TOKEN_SECRET);
  } catch (error) {
    return null;
  }
};

const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  let ip = '';

  if (Array.isArray(forwardedFor)) {
    ip = forwardedFor[0] || '';
  } else if (typeof forwardedFor === 'string') {
    ip = forwardedFor.split(',')[0] || '';
  }

  if (!ip) {
    const cfConnectingIp = req.headers['cf-connecting-ip'];
    if (typeof cfConnectingIp === 'string') {
      ip = cfConnectingIp;
    }
  }

  if (!ip) {
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string') {
      ip = realIp;
    }
  }

  if (!ip && req.ip) {
    ip = req.ip;
  }

  if (!ip && req.connection && req.connection.remoteAddress) {
    ip = req.connection.remoteAddress;
  }

  if (!ip && req.socket && req.socket.remoteAddress) {
    ip = req.socket.remoteAddress;
  }

  ip = (ip || '').trim();

  if (!ip) return 'unknown';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return '127.0.0.1';

  return ip;
};

// Extract device information from request
const extractDeviceInfo = (req) => {
  const userAgent = req.get('User-Agent') || '';
  const ipAddress = getClientIp(req);
  
  // Generate device ID based on user agent and IP
  const deviceId = generateDeviceId(userAgent, ipAddress);
  
  // Detect device type
  const deviceType = detectDeviceType(userAgent);
  
  // Detect browser
  const browser = detectBrowser(userAgent);
  
  // Detect OS
  const os = detectOS(userAgent);

  return {
    deviceId,
    userAgent,
    ipAddress,
    deviceType,
    browser,
    os,
    lastActive: new Date(),
    isActive: true
  };
};

// Generate unique device ID
const generateDeviceId = (userAgent, ipAddress) => {
  const hash = crypto.createHash('sha256');
  // Use stable components for consistent deviceId per browser/IP combination
  const stableString = userAgent + ipAddress;
  hash.update(stableString);
  return hash.digest('hex').substring(0, 16);
};

// Detect device type
const detectDeviceType = (userAgent) => {
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const tabletRegex = /iPad|Android(?=.*\bMobile\b)(?=.*\bSafari\b)/i;
  
  if (tabletRegex.test(userAgent)) return 'tablet';
  if (mobileRegex.test(userAgent)) return 'mobile';
  return 'desktop';
};

// Detect browser
const detectBrowser = (userAgent) => {
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  if (userAgent.includes('Opera')) return 'Opera';
  return 'Unknown';
};

// Detect OS
const detectOS = (userAgent) => {
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iOS')) return 'iOS';
  return 'Unknown';
};

// Hash password
const hashPassword = async (password) => {
  // const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  return await bcrypt.hash(password, 10);
};

// Compare password
const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// Attempt automatic token refresh
const attemptTokenRefresh = async (refreshToken, deviceId) => {
  try {
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return { success: false, error: 'Invalid refresh token' };
    }

    // Find user
    const user = await User.findById(decoded.id);
    if (!user || user.status !== 'active') {
      return { success: false, error: 'User not found or inactive' };
    }

    // Find device
    const device = await Device.findOne({
      userId: user._id,
      deviceId: deviceId,
      isActive: true
    });

    if (!device || device.refreshToken !== refreshToken) {
      return { success: false, error: 'Invalid device or token mismatch' };
    }

    // Check if device is locked
    if (device.security?.lockedUntil && device.security.lockedUntil > new Date()) {
      return { success: false, error: 'Device is locked' };
    }

    // Update device activity
    device.lastActive = new Date();
    device.activity = device.activity || {};
    device.activity.actions = device.activity.actions || [];
    device.activity.actions.push({
      action: 'automatic_token_refresh',
      timestamp: new Date()
    });

    // Keep only last 100 actions
    if (device.activity.actions.length > 100) {
      device.activity.actions = device.activity.actions.slice(-100);
    }

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

    return {
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    };

  } catch (error) {
    console.error('Token refresh attempt failed:', error);
    return { success: false, error: error.message };
  }
};

// Validate password strength
const validatePassword = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (password.length < minLength) {
    return { valid: false, message: `Password must be at least ${minLength} characters long` };
  }

  if (!hasUpperCase) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }

  if (!hasLowerCase) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }

  if (!hasNumbers) {
    return { valid: false, message: 'Password must contain at least one number' };
  }

  if (!hasSpecialChar) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }

  return { valid: true, message: 'Password is strong' };
};

// Authentication middleware with automatic refresh
const authenticateToken = async (req, res, next) => {
  try {
    // Get token from Authorization header or cookies
    let token = req.get('Authorization');
    if (token && token.startsWith('Bearer ')) {
      token = token.slice(7);
    } else {
      token = req.cookies?.accessToken;
    }

    if (!token) {
      return res.status(401).json({
        error: 'Access token required',
        message: 'Please provide a valid access token'
      });
    }

    // Verify access token
    const decoded = verifyAccessToken(token);
    if (!decoded) {
      // Check if we have a refresh token for automatic refresh
      const refreshToken = req.cookies?.refreshToken || req.get('X-Refresh-Token');
      const deviceId = req.cookies?.deviceId || req.get('X-Device-Id');
      
      if (refreshToken && deviceId) {
        try {
          // Attempt automatic token refresh
          const refreshResult = await attemptTokenRefresh(refreshToken, deviceId);
          if (refreshResult.success) {
            // Set new tokens in response headers for frontend to pick up
            res.set('X-New-Access-Token', refreshResult.accessToken);
            res.set('X-New-Refresh-Token', refreshResult.refreshToken);
            res.set('X-Token-Refreshed', 'true');
            
            // Continue with the new token
            const newDecoded = verifyAccessToken(refreshResult.accessToken);
            if (newDecoded) {
              // Find user with new token
              const user = await User.findById(newDecoded.id);
              if (user && user.status === 'active') {
                // Check if account is locked
                if (user.isLocked && user.lockedUntil > new Date()) {
                  return res.status(423).json({
                    error: 'Account locked',
                    message: 'Your account is temporarily locked'
                  });
                }

                // Find device
                const device = await Device.findOne({
                  userId: user._id,
                  deviceId: newDecoded.deviceId,
                  isActive: true
                });

                // Add user and device info to request
                req.user = {
                  id: user._id.toString(),
                  email: user.email,
                  firstName: user.firstName,
                  lastName: user.lastName,
                  role: user.role,
                  companyId: user.companyId?.toString(),
                  departmentId: user.departmentId || user.department?.toString(),
                  deviceId: newDecoded.deviceId
                };

                return next();
              }
            }
          }
        } catch (refreshError) {
          console.log('Automatic token refresh failed:', refreshError.message);
          // Continue to normal error response
        }
      }
      
      return res.status(401).json({
        error: 'Invalid or expired access token',
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

    // Check if account is locked
    if (user.isLocked && user.lockedUntil > new Date()) {
      return res.status(423).json({
        error: 'Account locked',
        message: 'Your account is temporarily locked'
      });
    }

    // Use deviceId from token if available, otherwise extract from request
    const deviceId = decoded.deviceId || extractDeviceInfo(req).deviceId;

    // Find device (optional for backward compatibility)
    const device = await Device.findOne({
      userId: user._id,
      deviceId: deviceId,
      isActive: true
    });

    // Don't fail if device not found - for backward compatibility
    if (device) {
      // Check if device is locked
      if (device.security?.lockedUntil && device.security.lockedUntil > new Date()) {
        return res.status(423).json({
          error: 'Device is locked',
          message: 'This device has been locked due to security concerns'
        });
      }

      // Update device activity
      device.ipAddress = getClientIp(req);
      device.lastActive = new Date();
      device.activity = device.activity || {};
      device.activity.actions = device.activity.actions || [];
      device.activity.actions.push({
        action: 'api_request',
        path: req.path,
        method: req.method,
        timestamp: new Date()
      });
      
      // Keep only last 100 actions
      if (device.activity.actions.length > 100) {
        device.activity.actions = device.activity.actions.slice(-100);
      }
      
      try {
        await device.save();
      } catch (saveError) {
        console.warn('Device activity update failed:', saveError.message);
        // Don't fail the request if device update fails
      }
    }

    // Add user and device info to request
    req.user = {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      companyId: user.companyId?.toString(),
      departmentId: user.departmentId || user.department?.toString(),
      deviceId: deviceId
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({
      error: 'Authentication failed',
      message: 'Internal authentication error'
    });
  }
};

// Role-based access control middleware
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please login to access this resource'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: 'You do not have permission to access this resource'
      });
    }

    next();
  };
};

// Company access control middleware
const requireCompanyAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please login to access this resource'
    });
  }

  // Super admin can access all companies
  if (req.user.role === 'super_admin') {
    return next();
  }

  // Other users need company access
  if (!req.user.companyId) {
    return res.status(403).json({
      error: 'Company access required',
      message: 'You must be associated with a company to access this resource'
    });
  }

  next();
};

// Department access control middleware
const requireDepartmentAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please login to access this resource'
    });
  }

  // Super admin and admin can access all departments
  if (['super_admin', 'admin'].includes(req.user.role)) {
    return next();
  }

  // Other users need department access
  if (!req.user.departmentId) {
    return res.status(403).json({
      error: 'Department access required',
      message: 'You must be associated with a department to access this resource'
    });
  }

  next();
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    let token = req.get('Authorization');
    if (token && token.startsWith('Bearer ')) {
      token = token.slice(7);
    } else {
      token = req.cookies?.accessToken;
    }

    if (token) {
      const decoded = verifyAccessToken(token);
      if (decoded) {
        const user = await User.findById(decoded.id);
        if (user && user.status === 'active') {
          req.user = {
            id: user._id.toString(),
            email: user.email,
            role: user.role,
            companyId: user.companyId?.toString(),
            departmentId: user.department?.toString()
          };
        }
      }
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  extractDeviceInfo,
  hashPassword,
  comparePassword,
  validatePassword,
  attemptTokenRefresh,
  authenticateToken,
  requireRole,
  requireCompanyAccess,
  requireDepartmentAccess,
  optionalAuth
};
