const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const ManagerService = require('../services/managerService');
const { User } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Configure Cloudinary
const cloudinaryConfig = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 60000 // 60 second timeout
};

// Check if Cloudinary is properly configured
const isCloudinaryConfigured = cloudinaryConfig.cloud_name &&
                               cloudinaryConfig.api_key &&
                               cloudinaryConfig.api_secret;

if (isCloudinaryConfigured) {
  cloudinary.config(cloudinaryConfig);
} else {
  console.warn('⚠️  Cloudinary not configured. Avatar uploads will fail. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file.');
}

// multer memory storage for buffering uploads before streaming to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit for avatars
});

// Helper function to upload buffer to cloudinary
const uploadBufferToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    // Set timeout for the upload
    const timeout = options.timeout || 60000; // 60 seconds default
    const timeoutId = setTimeout(() => {
      reject(new Error(`Upload timeout after ${timeout}ms`));
    }, timeout);

    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      clearTimeout(timeoutId);
      if (error) return reject(error);
      resolve(result);
    });

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// Initialize manager service
const managerService = new ManagerService();

/**
 * GET /api/manager/team-members
 * Get manager's team members
 */
router.get('/team-members', authenticateToken, async (req, res) => {
  try {
    console.log('🚀 Manager Team Members API called');
    console.log('🔍 User from token:', req.user);
    
    const managerId = req.user.id;
    console.log('🔍 Manager ID:', managerId);

    // Verify user is a manager
    if (req.user.role !== 'manager' && req.user.role !== 'department_head' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only managers can access this endpoint.',
        message: 'Insufficient permissions'
      });
    }

    const teamMembers = await managerService.getTeamMembers(managerId);
    
    res.json({
      success: true,
      data: {
        teamMembers,
        totalMembers: teamMembers.length
      },
      message: 'Team members retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Manager Team Members API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve team members',
      message: error.message
    });
  }
});

/**
 * GET /api/manager/dashboard
 * Get manager dashboard data including team tasks
 */
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    console.log('🚀 Manager Dashboard API called');
    console.log('🔍 User from token:', req.user);
    
    const managerId = req.user.id;
    console.log('🔍 Manager ID:', managerId);

    // Verify user is a manager
    if (req.user.role !== 'manager' && req.user.role !== 'department_head') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only managers can access this endpoint.',
        message: 'Insufficient permissions'
      });
    }

    const dashboardData = await managerService.getDashboard(managerId);
    
    console.log('✅ Manager dashboard data retrieved successfully');
    res.json({
      success: true,
      data: dashboardData,
      message: 'Manager dashboard data retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Manager dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load manager dashboard',
      message: error.message
    });
  }
});

/**
 * GET /api/manager/urgent-tasks
 * Get urgent tasks for manager's team
 */
router.get('/urgent-tasks', authenticateToken, async (req, res) => {
  try {
    console.log('🚀 Manager Urgent Tasks API called');
    
    const managerId = req.user.id;

    // Verify user is a manager
    if (req.user.role !== 'manager' && req.user.role !== 'department_head') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only managers can access this endpoint.',
        message: 'Insufficient permissions'
      });
    }

    const urgentTasks = await managerService.getUrgentTasks(managerId);
    
    console.log('✅ Urgent tasks retrieved successfully:', urgentTasks.length);
    res.json({
      success: true,
      data: {
        tasks: urgentTasks,
        count: urgentTasks.length
      },
      message: 'Urgent tasks retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Urgent tasks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load urgent tasks',
      message: error.message
    });
  }
});

/**
 * GET /api/manager/overdue-tasks
 * Get overdue tasks for manager's team
 */
router.get('/overdue-tasks', authenticateToken, async (req, res) => {
  try {
    console.log('🚀 Manager Overdue Tasks API called');
    
    const managerId = req.user.id;

    // Verify user is a manager
    if (req.user.role !== 'manager' && req.user.role !== 'department_head') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only managers can access this endpoint.',
        message: 'Insufficient permissions'
      });
    }

    const overdueTasks = await managerService.getOverdueTasks(managerId);
    
    console.log('✅ Overdue tasks retrieved successfully:', overdueTasks.length);
    res.json({
      success: true,
      data: {
        tasks: overdueTasks,
        count: overdueTasks.length
      },
      message: 'Overdue tasks retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Overdue tasks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load overdue tasks',
      message: error.message
    });
  }
});

/**
 * GET /api/manager/team-performance
 * Get team performance metrics
 */
router.get('/team-performance', authenticateToken, async (req, res) => {
  try {
    console.log('🚀 Manager Team Performance API called');
    
    const managerId = req.user.id;

    // Verify user is a manager
    if (req.user.role !== 'manager' && req.user.role !== 'department_head') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only managers can access this endpoint.',
        message: 'Insufficient permissions'
      });
    }

    const performanceData = await managerService.getTeamPerformance(managerId);
    
    console.log('✅ Team performance data retrieved successfully');
    res.json({
      success: true,
      data: performanceData,
      message: 'Team performance data retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Team performance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load team performance data',
      message: error.message
    });
  }
});

/**
 * GET /api/manager/member-tasks/:memberId
 * Get tasks for a specific team member
 */
router.get('/member-tasks/:memberId', authenticateToken, async (req, res) => {
  try {
    console.log('🚀 Manager Member Tasks API called');
    
    const managerId = req.user.id;
    const memberId = req.params.memberId;

    // Verify user is a manager
    if (req.user.role !== 'manager' && req.user.role !== 'department_head') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only managers can access this endpoint.',
        message: 'Insufficient permissions'
      });
    }

    // Verify the member is under this manager
    const teamMembers = await managerService.getTeamMembers(managerId);
    const isTeamMember = teamMembers.some(member => member._id.toString() === memberId);
    
    if (!isTeamMember) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Member is not under your management.',
        message: 'Insufficient permissions'
      });
    }

    const Task = require('../models/Task');
    const memberTasks = await Task.find({ assignedTo: memberId })
      .populate('assignedTo', 'firstName lastName email role')
      .populate('assignedBy', 'firstName lastName email')
      .populate('departmentId', 'name')
      .sort({ createdAt: -1 });
    
    console.log('✅ Member tasks retrieved successfully:', memberTasks.length);
    res.json({
      success: true,
      data: {
        tasks: memberTasks,
        count: memberTasks.length
      },
      message: 'Member tasks retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Member tasks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load member tasks',
      message: error.message
    });
  }
});

/**
 * GET /api/manager/team-management/overview
 * Get team management overview with statistics
 */
router.get('/team-management/overview', authenticateToken, async (req, res) => {
  try {
    console.log('🚀 Manager Team Management Overview API called');
    console.log('🔍 User from token:', req.user);
    
    const managerId = req.user.id;
    console.log('🔍 Manager ID:', managerId);

    // Verify user is a manager
    if (req.user.role !== 'manager' && req.user.role !== 'department_head') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only managers can access this endpoint.',
        message: 'Insufficient permissions'
      });
    }

    const teamManagementData = await managerService.getTeamManagementOverview(managerId);
    
    console.log('✅ Team management overview retrieved successfully');
    res.json({
      success: true,
      data: teamManagementData,
      message: 'Team management overview retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Team management overview error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load team management overview',
      message: error.message
    });
  }
});

/**
 * GET /api/manager/team-management/member/:memberId
 * Get specific team member details
 */
router.get('/team-management/member/:memberId', authenticateToken, async (req, res) => {
  try {
    console.log('🚀 Manager Team Member Details API called');
    console.log('🔍 User from token:', req.user);
    
    const managerId = req.user.id;
    const memberId = req.params.memberId;
    console.log('🔍 Manager ID:', managerId, 'Member ID:', memberId);

    // Verify user is a manager
    if (req.user.role !== 'manager' && req.user.role !== 'department_head') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only managers can access this endpoint.',
        message: 'Insufficient permissions'
      });
    }

    const memberDetails = await managerService.getTeamMemberDetails(managerId, memberId);
    
    console.log('✅ Team member details retrieved successfully');
    res.json({
      success: true,
      data: memberDetails,
      message: 'Team member details retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Team member details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load team member details',
      message: error.message
    });
  }
});

/**
 * PUT /api/manager/team-management/member/:memberId/status
 * Update team member status (active/inactive)
 */
router.put('/team-management/member/:memberId/status', authenticateToken, async (req, res) => {
  try {
    console.log('🚀 Manager Update Team Member Status API called');
    console.log('🔍 User from token:', req.user);
    
    const managerId = req.user.id;
    const memberId = req.params.memberId;
    const { isActive } = req.body;
    console.log('🔍 Manager ID:', managerId, 'Member ID:', memberId, 'isActive:', isActive);

    // Verify user is a manager
    if (req.user.role !== 'manager' && req.user.role !== 'department_head') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only managers can access this endpoint.',
        message: 'Insufficient permissions'
      });
    }

    // Validate input
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input. isActive must be a boolean value.',
        message: 'Bad request'
      });
    }

    const updatedMember = await managerService.updateTeamMemberStatus(managerId, memberId, isActive);
    
    console.log('✅ Team member status updated successfully');
    res.json({
      success: true,
      data: updatedMember,
      message: 'Team member status updated successfully'
    });
  } catch (error) {
    console.error('❌ Update team member status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update team member status',
      message: error.message
    });
  }
});

/**
 * GET /api/manager/team-management/performance
 * Get team performance analytics
 */
router.get('/team-management/performance', authenticateToken, async (req, res) => {
  try {
    console.log('🚀 Manager Team Performance Analytics API called');
    console.log('🔍 User from token:', req.user);
    
    const managerId = req.user.id;
    console.log('🔍 Manager ID:', managerId);

    // Verify user is a manager
    if (req.user.role !== 'manager' && req.user.role !== 'department_head') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only managers can access this endpoint.',
        message: 'Insufficient permissions'
      });
    }

    const performanceData = await managerService.getTeamPerformanceAnalytics(managerId);
    
    console.log('✅ Team performance analytics retrieved successfully');
    res.json({
      success: true,
      data: performanceData,
      message: 'Team performance analytics retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Team performance analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load team performance analytics',
      message: error.message
    });
  }
});

/**
 * GET /api/manager/profile
 * Get manager profile information
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    console.log('🚀 Manager Profile API called');

    const managerId = req.user.id;

    // Verify user is a manager
    if (req.user.role !== 'manager') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only managers can access this endpoint.',
        message: 'Insufficient permissions'
      });
    }

    const manager = await User.findById(managerId)
      .select('-password -resetPasswordToken -resetPasswordExpires -emailVerificationToken')
      .populate('department', 'name color description')
      .populate('companyId', 'name')
      .populate('managedMemberIds', 'firstName lastName email role');

    if (!manager) {
      return res.status(404).json({ error: 'Manager not found' });
    }

    console.log('✅ Manager profile retrieved successfully');
    res.json({
      success: true,
      data: manager,
      message: 'Manager profile retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Manager profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load manager profile',
      message: error.message
    });
  }
});

/**
 * PUT /api/manager/profile/details
 * Update manager profile details
 */
router.put('/profile/details', [
  authenticateToken,
  body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
  body('phone').optional().custom((value) => {
    if (!value || value === '' || value === null || value === undefined) {
      return true; // Allow empty values
    }
    return require('validator').isMobilePhone(value);
  }).withMessage('Invalid phone number'),
  body('mobileNumber').optional().custom((value) => {
    if (!value || value === '' || value === null || value === undefined) {
      return true; // Allow empty values
    }
    return require('validator').isMobilePhone(value);
  }).withMessage('Invalid mobile number')
], async (req, res) => {
  try {
    console.log('🚀 Manager Update Profile Details API called');

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: errors.array()[0].msg,
        details: errors.array()
      });
    }

    const managerId = req.user.id;
    const updateData = req.body;

    // Verify user is a manager
    if (req.user.role !== 'manager') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only managers can update their profile.',
        message: 'Insufficient permissions'
      });
    }

    // Verify manager exists
    const manager = await User.findById(managerId);
    if (!manager) {
      return res.status(404).json({
        error: 'Manager not found',
        message: 'Manager does not exist'
      });
    }

    // Remove sensitive fields that shouldn't be updated through this endpoint
    const allowedFields = ['firstName', 'lastName', 'phone', 'mobileNumber'];
    const filteredUpdateData = {};

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        filteredUpdateData[field] = updateData[field];
      }
    });

    // Update name field if firstName or lastName changed
    if (filteredUpdateData.firstName || filteredUpdateData.lastName) {
      const newFirst = filteredUpdateData.firstName || manager.firstName;
      const newLast = filteredUpdateData.lastName || manager.lastName;
      filteredUpdateData.name = `${newFirst} ${newLast}`.trim();
    }

    const updatedManager = await User.findByIdAndUpdate(
      managerId,
      filteredUpdateData,
      { new: true, runValidators: true }
    )
    .select('-password -resetPasswordToken -resetPasswordExpires -emailVerificationToken')
    .populate('department', 'name color')
    .populate('companyId', 'name');

    console.log('✅ Manager profile details updated successfully');
    res.json({
      success: true,
      data: updatedManager,
      message: 'Manager profile details updated successfully'
    });
  } catch (error) {
    console.error('❌ Update manager profile details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile details',
      message: error.message
    });
  }
});

/**
 * POST /api/manager/profile/avatar
 * Upload manager avatar
 */
router.post('/profile/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  // Set longer timeout for file uploads
  req.setTimeout(120000); // 2 minutes
  res.setTimeout(120000); // 2 minutes

  try {
    console.log('🚀 Manager Avatar Upload API called');

    const managerId = req.user.id;

    // Verify user is a manager
    if (req.user.role !== 'manager') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only managers can update their avatar.',
        message: 'Insufficient permissions'
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please select an image file'
      });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        error: 'Invalid file type',
        message: 'Only JPEG, PNG, GIF, and WebP images are allowed'
      });
    }

    // Find manager
    const manager = await User.findById(managerId);
    if (!manager) {
      return res.status(404).json({
        error: 'Manager not found',
        message: 'Manager does not exist'
      });
    }

    console.log('Uploading avatar for manager:', managerId, 'file:', req.file.originalname);

    // Check if Cloudinary is configured
    if (!isCloudinaryConfigured) {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'Avatar upload service is not configured. Please contact your administrator to set up Cloudinary credentials.'
      });
    }

    // Upload to Cloudinary
    const uploadOptions = {
      resource_type: 'image',
      folder: 'manager-avatars',
      public_id: `manager-${managerId}-${Date.now()}`,
      timeout: 60000, // 60 second timeout
      transformation: [
        { width: 300, height: 300, crop: 'fill', gravity: 'auto' },
        { quality: 'auto', format: 'jpg' }
      ]
    };

    console.log('Starting Cloudinary upload with options:', uploadOptions);
    const result = await uploadBufferToCloudinary(req.file.buffer, uploadOptions);
    console.log('Manager avatar upload successful:', result.secure_url || result.url);

    // Validate the result
    if (!result || !result.secure_url) {
      throw new Error('Cloudinary upload failed - no URL returned');
    }

    // Update manager avatar in database
    manager.avatar = result.secure_url || result.url;
    await manager.save();

    console.log('✅ Manager avatar uploaded successfully');
    res.json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: {
        avatar: manager.avatar,
        manager: {
          id: manager._id,
          firstName: manager.firstName,
          lastName: manager.lastName,
          avatar: manager.avatar
        }
      }
    });

  } catch (error) {
    console.error('❌ Manager avatar upload error:', error);

    // Handle specific error types
    if (error.message && error.message.includes('timeout')) {
      return res.status(408).json({
        error: 'Upload timeout',
        message: 'Upload took too long. Please try with a smaller file or check your connection.'
      });
    }

    if (error.message && error.message.includes('file size')) {
      return res.status(413).json({
        error: 'File too large',
        message: 'File size exceeds the 5MB limit. Please choose a smaller image.'
      });
    }

    res.status(500).json({
      error: 'Upload failed',
      message: error.message || 'Failed to upload avatar. Please try again.'
    });
  }
});

module.exports = router;
