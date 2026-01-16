const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const rateLimit = require('express-rate-limit');
const { User, Company, Department, Task, Meeting } = require('../models');
const { requireRole, requireCompanyAccess } = require('../middleware/auth');
const { sendUserCreationEmail, sendManagerAddedNotification, sendMemberAddedNotificationToHOD, sendMemberAddedNotificationToManager } = require('../services/emailService');

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

// helper: upload buffer to cloudinary, returns result
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

const router = express.Router();

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

// Apply HOD panel rate limiter to all user routes
router.use(hodPanelLimiter);

// @route   GET /api/users
// @desc    Get all users (with pagination and filters)
// @access  Private (Admin, Super Admin, HOD, Department Head, HR, HR Manager)
router.get('/', requireRole(['admin', 'super_admin', 'hod', 'department_head', 'hr', 'hr_manager']), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      role = '',
      status = '',
      companyId = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    // Build filter query
    const filter = {};

    // Company filter (for company admins, HODs, and HR users)
    if (req.user.role === 'admin' || req.user.role === 'hod' || req.user.role === 'department_head' || req.user.role === 'hr' || req.user.role === 'hr_manager') {
      filter.companyId = req.user.companyId;
    } else if (companyId) {
      filter.companyId = companyId;
    }

    // Search filter
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Role filter
    if (role) {
      filter.role = role;
    }

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Get users with pagination
    const users = await User.find(filter)
      .populate('companyId', 'name domain')
      .populate('department', 'name')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-password -failedLoginAttempts -lockedUntil');

    // Get total count
    const total = await User.countDocuments(filter);

    // Transform users for response
    const transformedUsers = users.map(user => ({
      id: user._id,
      name: user.name || `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      status: user.status,
      isActive: user.isActive,
      avatar: user.avatar,
      phone: user.phone,
      mobileNumber: user.mobileNumber,
      departmentId: user.department ? user.department._id : user.departmentId,
      managerId: user.managerId,
      department: user.department ? user.department : user.departmentId,
      company: user.companyId,
      lastLogin: user.lastLogin,
      lastActive: user.lastActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      managedManagerIds: user.managedManagerIds || [],
      managedMemberIds: user.managedMemberIds || [],
      securitySettings: user.securitySettings,
      devicePreferences: user.devicePreferences
    }));

    res.status(200).json({
      success: true,
      data: transformedUsers,
      users: transformedUsers, // Keep for backward compatibility
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      error: 'Failed to get users',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/users/stats
// @desc    Get user statistics
// @access  Private (Admin, Super Admin)
router.get('/stats', requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { companyId } = req.query;
    const requestingUser = req.user;

    // Build filter query
    const filter = {};

    // Company filter (for company admins) - allow matching by ObjectId or string
    if (requestingUser.role === 'admin') {
      try {
        const cid = mongoose.Types.ObjectId(requestingUser.companyId);
        filter.$or = [{ companyId: cid }, { companyId: String(requestingUser.companyId) }];
      } catch (e) {
        filter.companyId = requestingUser.companyId;
      }
    } else if (companyId) {
      try {
        const cid = mongoose.Types.ObjectId(companyId);
        filter.$or = [{ companyId: cid }, { companyId: String(companyId) }];
      } catch (e) {
        // companyId not a valid ObjectId, match as string
        filter.companyId = companyId;
      }
    }

    // Get user statistics
    const totalUsers = await User.countDocuments(filter);
    const activeUsers = await User.countDocuments({ ...filter, status: 'active' });
    const inactiveUsers = await User.countDocuments({ ...filter, status: 'inactive' });
    const suspendedUsers = await User.countDocuments({ ...filter, status: 'suspended' });

    // Get users by role
    const usersByRole = await User.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get recent users (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentUsers = await User.countDocuments({
      ...filter,
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Get users with recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const activeUsers7Days = await User.countDocuments({
      ...filter,
      lastActive: { $gte: sevenDaysAgo }
    });

    res.status(200).json({
      success: true,
      stats: {
        total: totalUsers,
        active: activeUsers,
        inactive: inactiveUsers,
        suspended: suspendedUsers,
        recent: recentUsers,
        active7Days: activeUsers7Days,
        byRole: usersByRole.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      }
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      error: 'Failed to get user statistics',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/users/invite
// @desc    Invite user by email (creates user with temporary password and returns invite data)
// @access  Private (Admin, Super Admin)
router.post('/invite', requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { email, firstName = 'New', lastName = 'User', role = 'member', companyId: bodyCompanyId, departmentId } = req.body;

    // Determine company scope: admins are limited to their company
    const companyId = req.user.role === 'admin' ? req.user.companyId : (bodyCompanyId || req.user.companyId);

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    // Check if user exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    // Generate temporary password
    const crypto = require('crypto');
    const tempPassword = crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'Temp1234!';

    // Hash password using bcrypt if model expects plain hashing; the User model's pre-save may hash
    const bcrypt = require('bcryptjs');
    const hashed = await bcrypt.hash(tempPassword, 10);

    const user = new User({
      username: email.split('@')[0],
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      email,
      password: hashed,
      role,
      companyId,
      department: departmentId || null,
      departmentId: departmentId || null,
      status: 'active'
    });

    await user.save();

    // Note: real implementation should send an email invitation with a secure link. Here we return temp password for manual delivery in dev.
    res.status(201).json({ success: true, message: 'User invited', invite: { email, tempPassword }, user: { id: user._id, email: user.email, role: user.role, companyId: user.companyId } });
  } catch (err) {
    console.error('Invite user error:', err);
    res.status(500).json({ success: false, error: 'Failed to invite user' });
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private (Admin, Super Admin, or self)
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.params.id;
    // Guard: if path segment matches a literal route like 'stats', delegate to next route
    if (userId === 'stats') return next();
    const requestingUser = req.user;

    // Check if user can access this profile
    if (requestingUser.role !== 'super_admin' && 
        requestingUser.role !== 'admin' && 
        requestingUser.id !== userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own profile'
      });
    }

    // For company admins, ensure user belongs to their company
    if (requestingUser.role === 'admin' && requestingUser.id !== userId) {
      const user = await User.findById(userId);
      if (!user || user.companyId.toString() !== requestingUser.companyId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'User not found in your company'
        });
      }
    }

    const user = await User.findById(userId)
      .populate('companyId', 'name domain')
      .populate('department', 'name')
      .select('-password -failedLoginAttempts -lockedUntil');

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name || `${user.firstName} ${user.lastName}`,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        status: user.status,
        isActive: user.isActive,
        avatar: user.avatar,
        phone: user.phone,
        mobileNumber: user.mobileNumber,
        departmentId: user.department ? user.department._id : user.departmentId,
        managerId: user.managerId,
        department: user.department ? user.department : user.departmentId,
        company: user.companyId,
        managedManagerIds: user.managedManagerIds || [],
        managedMemberIds: user.managedMemberIds || [],
        lastLogin: user.lastLogin,
        lastActive: user.lastActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        securitySettings: user.securitySettings,
        devicePreferences: user.devicePreferences
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/users
// @desc    Create new user
// @access  Private (Admin, Super Admin)
router.post('/', [
  requireRole(['admin', 'super_admin']),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').optional().isLength({ min: 0 }).withMessage('Last name must be a string'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['super_admin', 'admin', 'department_head', 'manager', 'hr', 'hr_manager', 'member', 'person']).withMessage('Invalid role'),
  body('companyId').optional().isMongoId().withMessage('Invalid company ID'),
  body('departmentId').optional().custom((value) => {
    if (value === 'none' || value === null || value === undefined || value === '') {
      return true; // Allow 'none' as valid value
    }
    return require('mongoose').Types.ObjectId.isValid(value);
  }).withMessage('Invalid department ID'),
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
  }).withMessage('Invalid mobile number'),
  body('status').optional().isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status')
], async (req, res) => {
  console.log('Create user request:', req.body);
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Return full array of validation errors to help debugging
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const {
      firstName,
      lastName,
      name,
      email,
      password,
      role,
      companyId,
      departmentId: rawDepartmentId,
      managerId: rawManagerId,
      phone,
      mobileNumber,
      status = 'active'
    } = req.body;


    // Convert 'none' strings to null for database storage
    let departmentId = (rawDepartmentId === 'none' || rawDepartmentId === '' || !rawDepartmentId) ? null : rawDepartmentId;
    let managerId = (rawManagerId === 'none' || rawManagerId === '' || !rawManagerId) ? null : rawManagerId;

    // If creator is a member and no manager is specified, assign the member's manager
    if (req.user.role === 'member' && !managerId) {
      managerId = req.user.managerId;
      // Also ensure department is set to the member's department if not specified
      if (!departmentId) {
        departmentId = req.user.departmentId || req.user.department;
      }
    }

    // Ensure a unique username is provided (frontend may not send one)
    let { username } = req.body || {};
    if (!username) {
      const sanitize = (str) => (str || '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const base = sanitize(`${firstName || ''}${lastName ? '.' + lastName : ''}`) || sanitize((email || '').split('@')[0]) || 'user';
      let candidate = base;
      let suffix = 0;
      // Find a unique username (append number suffix if needed)
      while (await User.findOne({ username: candidate })) {
        suffix += 1;
        candidate = `${base}${suffix}`;
      }
      username = candidate;
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        error: 'Email already exists',
        message: 'A user with this email already exists'
      });
    }

    // For company admins, ensure they can only create users in their company
    if (req.user.role === 'admin') {
      if (companyId && companyId !== req.user.companyId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only create users in your company'
        });
      }
    }

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
      firstName,
      lastName: lastName || 'User', // Provide default lastName if empty
      name: name || `${firstName} ${lastName || 'User'}`,
      email,
      password,
      role,
      companyId: companyId || req.user.companyId,
      department: departmentId || null,
      departmentId,
      managerId,
      phone,
      mobileNumber,
      status,
      securitySettings: {
        twoFactorEnabled: false,
        requireDeviceApproval: false,
        maxActiveDevices: 5,
        sessionTimeout: 30
      },
      devicePreferences: {
        defaultTheme: 'light',
        language: 'en',
        timezone: 'UTC',
        notifications: {
          email: true,
          push: true,
          sms: false
        }
      }
    });

    await user.save();

    // If the created user is a department head, update the department's headId
    if (role === 'department_head' && departmentId) {
      try {
        await Department.findByIdAndUpdate(
          departmentId,
          { headId: user._id },
          { new: true, runValidators: true }
        );
      } catch (err) {
        console.error('Failed to update department head:', err);
        // Do not fail user creation if department update fails
      }
    }

    // If creating a manager, require hodId in body and link manager to HOD and Department
    if (role === 'manager') {
      const { hodId } = req.body || {};
      if (!hodId) {
        // rollback created user
        try { await User.findByIdAndDelete(user._id); } catch (e) {}
        return res.status(400).json({
          error: 'HOD required',
          message: 'When creating a manager you must provide hodId (department head id)'
        });
      }

      try {
        // Add manager id to Department.assistantManagerIds (do NOT add to memberIds) and increment employeeCount
        if (departmentId) {
          try {
            await Department.findByIdAndUpdate(
              departmentId,
              { 
                $addToSet: { managerIds: user._id },
                $inc: { employeeCount: 1 }
              },
              { new: true, runValidators: true }
            );
          } catch (e) {
            console.error('Failed to update department manager list:', e);
          }
        }

        // Add manager reference to HOD's managedManagerIds array
        const hod = await User.findById(hodId);
        if (!hod) {
          try { await User.findByIdAndDelete(user._id); } catch (e) {}
          return res.status(400).json({ error: 'Invalid HOD', message: 'Provided hodId does not exist' });
        }

        // Ensure hod role is department_head
        if (hod.role !== 'department_head') {
          try { await User.findByIdAndDelete(user._id); } catch (e) {}
          return res.status(400).json({ error: 'Invalid HOD', message: 'Provided hodId is not a department head' });
        }

        hod.managedManagerIds = hod.managedManagerIds || [];
        if (!hod.managedManagerIds.includes(user._id)) hod.managedManagerIds.push(user._id);
        await hod.save();
      } catch (err) {
        console.error('Failed to link manager to HOD/Department:', err);
        // best-effort: do not fail silently
      }
    }

    // If creating a regular member, add to department.memberIds and increment employeeCount
    if (role === 'member' && departmentId) {
      try {
        await Department.findByIdAndUpdate(
          departmentId,
          {
            $addToSet: { memberIds: user._id },
            $inc: { employeeCount: 1 }
          },
          { new: true, runValidators: true }
        );

        // Decide where to attach this member in manager/HOD lists
        const providedManagerId = req.body.managerId;
        // Find HOD for this department (if any)
        const dept = await Department.findById(departmentId);
        const hodId = dept ? dept.headId : null;

        if (providedManagerId && providedManagerId !== 'none') {
          // Add to selected manager
          const managerUser = await User.findById(providedManagerId);
          if (managerUser) {
            managerUser.managedMemberIds = managerUser.managedMemberIds || [];
            if (!managerUser.managedMemberIds.includes(user._id)) {
              managerUser.managedMemberIds.push(user._id);
              await managerUser.save();
            }
          }
          // Also add to HOD (if exists) so both have the member
          if (hodId) {
            const hodUser = await User.findById(hodId);
            if (hodUser) {
              hodUser.managedMemberIds = hodUser.managedMemberIds || [];
              if (!hodUser.managedMemberIds.includes(user._id)) {
                hodUser.managedMemberIds.push(user._id);
                await hodUser.save();
              }
            }
          }
        } else {
          // No manager provided: add member under HOD's managedMemberIds only
          if (hodId) {
            const hodUser = await User.findById(hodId);
            if (hodUser) {
              hodUser.managedMemberIds = hodUser.managedMemberIds || [];
              if (!hodUser.managedMemberIds.includes(user._id)) {
                hodUser.managedMemberIds.push(user._id);
                await hodUser.save();
              }
            }
          }
        }

      } catch (err) {
        console.error('Failed to add member to department:', err);
      }
    }

    // Populate company and department
    await user.populate('companyId', 'name domain');
    await user.populate('department', 'name');

    // Send user creation email
    try {
      let departmentData = null;

      // Get department information if user is assigned to a department
      if (departmentId) {
        const department = await Department.findById(departmentId).populate('headId', 'firstName lastName');
        if (department) {
          departmentData = {
            name: department.name,
            hodName: department.headId ? `${department.headId.firstName} ${department.headId.lastName}` : 'Not Available'
          };

          // If creator is manager, also get manager's name
          if (req.user.role === 'manager') {
            const manager = await User.findById(req.user._id);
            departmentData.managerName = manager ? `${manager.firstName} ${manager.lastName}` : 'Not Available';
          }
        }
      }

      // Prepare creator data
      const creatorData = {
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        role: req.user.role,
        email: req.user.email
      };

      // Prepare user data for email
      const userData = {
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        email: user.email
      };

      // Send email
      const companyName = user.companyId?.name || 'NevoStack';
      const emailResult = await sendUserCreationEmail(
        user.email, // to email
        userData, // user data
        creatorData, // creator data
        departmentData, // department data
        companyName // company name
      );

      if (emailResult.success) {
        console.log('✅ User creation email sent to:', user.email);
      } else {
        console.log('⚠️ User creation email failed to send:', emailResult.error);
      }

      // Send notification emails based on user role
      try {
        if (role === 'manager' && departmentData) {
          // Notify HOD when a manager is added
          const department = await Department.findById(departmentId).populate('headId', 'firstName lastName email');
          if (department && department.headId && department.headId.email !== req.user.email) {
            const hodEmailResult = await sendManagerAddedNotification(
              department.headId.email,
              `${department.headId.firstName} ${department.headId.lastName}`,
              {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                createdBy: `${req.user.firstName} ${req.user.lastName}`
              },
              {
                id: department._id,
                name: department.name,
                hodName: `${department.headId.firstName} ${department.headId.lastName}`
              },
              companyName
            );

            if (hodEmailResult.success) {
              console.log('✅ Manager added notification sent to HOD:', department.headId.email);
            } else {
              console.log('⚠️ Manager added notification failed to HOD:', hodEmailResult.error);
            }
          }
        } else if (role === 'member' && departmentData) {
          // Notify HOD and assigned manager when a member is added
          const department = await Department.findById(departmentId).populate('headId', 'firstName lastName email');

          // Notify HOD
          if (department && department.headId && department.headId.email !== req.user.email) {
            const managerName = managerId ? await User.findById(managerId).then(m => m ? `${m.firstName} ${m.lastName}` : 'Not Assigned') : 'Not Assigned';

            const hodEmailResult = await sendMemberAddedNotificationToHOD(
              department.headId.email,
              `${department.headId.firstName} ${department.headId.lastName}`,
              {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                managerName: managerName,
                createdBy: `${req.user.firstName} ${req.user.lastName}`
              },
              {
                id: department._id,
                name: department.name,
                hodName: `${department.headId.firstName} ${department.headId.lastName}`
              },
              companyName
            );

            if (hodEmailResult.success) {
              console.log('✅ Member added notification sent to HOD:', department.headId.email);
            } else {
              console.log('⚠️ Member added notification failed to HOD:', hodEmailResult.error);
            }
          }

          // Notify assigned manager (always notify the member's manager)
          if (managerId) {
            const assignedManager = await User.findById(managerId);
            if (assignedManager && assignedManager.email !== req.user.email) {
              const managerEmailResult = await sendMemberAddedNotificationToManager(
                assignedManager.email,
                `${assignedManager.firstName} ${assignedManager.lastName}`,
                {
                  firstName: user.firstName,
                  lastName: user.lastName,
                  email: user.email,
                  role: user.role,
                  createdBy: `${req.user.firstName} ${req.user.lastName}`
                },
                {
                  name: departmentData.name,
                  hodName: department && department.headId ? `${department.headId.firstName} ${department.headId.lastName}` : 'Not Available'
                },
                companyName
              );

              if (managerEmailResult.success) {
                console.log('✅ Member assigned notification sent to manager:', assignedManager.email);
              } else {
                console.log('⚠️ Member assigned notification failed to manager:', managerEmailResult.error);
              }
            }
          }
        }
      } catch (notificationError) {
        console.error('❌ Error sending notification emails:', notificationError);
        // Don't fail the user creation if notification emails fail
      }
    } catch (emailError) {
      console.error('❌ Error sending user creation email:', emailError);
      // Don't fail the user creation if email fails
    }

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user._id,
        name: user.name || `${user.firstName} ${user.lastName}`,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        status: user.status,
        isActive: user.isActive,
        avatar: user.avatar,
        phone: user.phone,
        departmentId: user.department ? user.department._id : user.departmentId,
        managerId: user.managerId,
        department: user.department ? user.department : user.departmentId,
        company: user.companyId,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      error: 'Failed to create user',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/users/exchange-hod
// @desc    Exchange HOD between two departments
// @access  Private (Admin, Super Admin)
router.post('/exchange-hod', [
  requireRole(['admin', 'super_admin']),
  body('sourceHodId').isMongoId().withMessage('Invalid source HOD ID'),
  body('targetHodId').isMongoId().withMessage('Invalid target HOD ID')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      message: errors.array()[0].msg,
      details: errors.array()
    });
  }

  const { sourceHodId, targetHodId } = req.body;
  if (sourceHodId === targetHodId) {
    return res.status(400).json({
      success: false,
      error: 'Invalid exchange',
      message: 'Source and target HOD must be different users'
    });
  }

  const session = await User.startSession();
  session.startTransaction();

  try {
    const [sourceHod, targetHod] = await Promise.all([
      User.findById(sourceHodId).session(session),
      User.findById(targetHodId).session(session)
    ]);

    if (!sourceHod || !targetHod) {
      const err = new Error('Both HOD users must exist to exchange');
      err.statusCode = 404;
      err.error = 'HOD not found';
      throw err;
    }

    if (sourceHod.role !== 'department_head' || targetHod.role !== 'department_head') {
      const err = new Error('Both users must be department heads for exchange');
      err.statusCode = 400;
      err.error = 'Invalid roles';
      throw err;
    }

    const normalizeDeptId = (value) => {
      if (!value) return null;
      if (typeof value === 'string') {
        return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;
      }
      return value;
    };

    const sourceDeptObjectId = normalizeDeptId(sourceHod.department || sourceHod.departmentId);
    const targetDeptObjectId = normalizeDeptId(targetHod.department || targetHod.departmentId);

    if (!sourceDeptObjectId || !targetDeptObjectId) {
      const err = new Error('Both HODs must be assigned to a department');
      err.statusCode = 400;
      err.error = 'Department required';
      throw err;
    }

    if (String(sourceDeptObjectId) === String(targetDeptObjectId)) {
      const err = new Error('Both HODs must belong to different departments');
      err.statusCode = 400;
      err.error = 'Invalid exchange';
      throw err;
    }

    const [sourceDept, targetDept] = await Promise.all([
      Department.findById(sourceDeptObjectId).session(session),
      Department.findById(targetDeptObjectId).session(session)
    ]);

    if (!sourceDept || !targetDept) {
      const err = new Error('Both departments must exist to exchange HODs');
      err.statusCode = 404;
      err.error = 'Department not found';
      throw err;
    }

    if (!sourceDept.headId || String(sourceDept.headId) !== String(sourceHod._id)) {
      const err = new Error('Source department does not have the specified HOD');
      err.statusCode = 400;
      err.error = 'Missing HOD';
      throw err;
    }

    if (!targetDept.headId || String(targetDept.headId) !== String(targetHod._id)) {
      const err = new Error('Target department does not have the specified HOD');
      err.statusCode = 400;
      err.error = 'Missing HOD';
      throw err;
    }

    const withoutUser = (list, userId) => (list || []).filter(
      (item) => String(item) !== String(userId)
    );

    const sourceManagers = withoutUser(sourceDept.managerIds, sourceHod._id);
    const sourceMembers = withoutUser(sourceDept.memberIds, sourceHod._id);
    const targetManagers = withoutUser(targetDept.managerIds, targetHod._id);
    const targetMembers = withoutUser(targetDept.memberIds, targetHod._id);

    await Promise.all([
      Department.updateOne(
        { _id: sourceDept._id },
        { headId: targetHod._id },
        { session }
      ),
      Department.updateOne(
        { _id: targetDept._id },
        { headId: sourceHod._id },
        { session }
      ),
      User.updateOne(
        { _id: sourceHod._id },
        {
          role: 'department_head',
          department: targetDept._id,
          departmentId: String(targetDept._id),
          managerId: null,
          managedManagerIds: targetManagers,
          managedMemberIds: targetMembers
        },
        { session }
      ),
      User.updateOne(
        { _id: targetHod._id },
        {
          role: 'department_head',
          department: sourceDept._id,
          departmentId: String(sourceDept._id),
          managerId: null,
          managedManagerIds: sourceManagers,
          managedMemberIds: sourceMembers
        },
        { session }
      )
    ]);

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: 'HOD exchange completed successfully',
      exchange: {
        sourceHodId,
        targetHodId,
        sourceDepartmentId: String(sourceDept._id),
        targetDepartmentId: String(targetDept._id)
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Exchange HOD error:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.error || 'Failed to exchange HOD',
      message: error.message || 'Internal server error'
    });
  }
});

// @route   POST /api/users/exchange-manager
// @desc    Exchange managers between two departments
// @access  Private (Admin, Super Admin)
router.post('/exchange-manager', [
  requireRole(['admin', 'super_admin']),
  body('sourceManagerId').isMongoId().withMessage('Invalid source manager ID'),
  body('targetManagerId').isMongoId().withMessage('Invalid target manager ID')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      message: errors.array()[0].msg,
      details: errors.array()
    });
  }

  const { sourceManagerId, targetManagerId } = req.body;
  if (sourceManagerId === targetManagerId) {
    return res.status(400).json({
      success: false,
      error: 'Invalid exchange',
      message: 'Source and target manager must be different users'
    });
  }

  const session = await User.startSession();
  session.startTransaction();

  try {
    const [sourceManager, targetManager] = await Promise.all([
      User.findById(sourceManagerId).session(session),
      User.findById(targetManagerId).session(session)
    ]);

    if (!sourceManager || !targetManager) {
      const err = new Error('Both managers must exist to exchange');
      err.statusCode = 404;
      err.error = 'Manager not found';
      throw err;
    }

    if (sourceManager.role !== 'manager' || targetManager.role !== 'manager') {
      const err = new Error('Both users must be managers for exchange');
      err.statusCode = 400;
      err.error = 'Invalid roles';
      throw err;
    }

    const normalizeDeptId = (value) => {
      if (!value) return null;
      if (typeof value === 'string') {
        return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;
      }
      return value;
    };

    const sourceDeptObjectId = normalizeDeptId(sourceManager.department || sourceManager.departmentId);
    const targetDeptObjectId = normalizeDeptId(targetManager.department || targetManager.departmentId);

    if (!sourceDeptObjectId || !targetDeptObjectId) {
      const err = new Error('Both managers must be assigned to a department');
      err.statusCode = 400;
      err.error = 'Department required';
      throw err;
    }

    if (String(sourceDeptObjectId) === String(targetDeptObjectId)) {
      const err = new Error('Managers must belong to different departments');
      err.statusCode = 400;
      err.error = 'Invalid exchange';
      throw err;
    }

    const [sourceDept, targetDept] = await Promise.all([
      Department.findById(sourceDeptObjectId).session(session),
      Department.findById(targetDeptObjectId).session(session)
    ]);

    if (!sourceDept || !targetDept) {
      const err = new Error('Both departments must exist to exchange managers');
      err.statusCode = 404;
      err.error = 'Department not found';
      throw err;
    }

    const isSourceManagerInDept = (sourceDept.managerIds || []).some(
      (id) => String(id) === String(sourceManager._id)
    );
    const isTargetManagerInDept = (targetDept.managerIds || []).some(
      (id) => String(id) === String(targetManager._id)
    );

    if (!isSourceManagerInDept || !isTargetManagerInDept) {
      const err = new Error('Managers are not assigned to their respective departments');
      err.statusCode = 400;
      err.error = 'Manager mismatch';
      throw err;
    }

    const [sourceHod, targetHod] = await Promise.all([
      User.findOne({ role: 'department_head', departmentId: String(sourceDept._id) }).session(session),
      User.findOne({ role: 'department_head', departmentId: String(targetDept._id) }).session(session)
    ]);

    if (!sourceHod || !targetHod) {
      const err = new Error('Both departments must have a HOD assigned');
      err.statusCode = 400;
      err.error = 'Missing HOD';
      throw err;
    }

    const fetchDepartmentMembers = async (memberIds, deptId) => {
      if (!memberIds || memberIds.length === 0) return [];
      const members = await User.find({
        _id: { $in: memberIds },
        departmentId: String(deptId)
      }).select('_id').session(session);
      return members.map((m) => m._id);
    };

    const sourceMemberIds = await fetchDepartmentMembers(
      sourceManager.managedMemberIds || [],
      sourceDept._id
    );
    const targetMemberIds = await fetchDepartmentMembers(
      targetManager.managedMemberIds || [],
      targetDept._id
    );

    
    const updateIdList = (list, removeId, addId) => {
      const set = new Set((list || []).map((id) => String(id)));
      set.delete(String(removeId));
      set.add(String(addId));
      return Array.from(set);
    };

    const updatedSourceDeptManagerIds = updateIdList(
      sourceDept.managerIds,
      sourceManager._id,
      targetManager._id
    );
    const updatedTargetDeptManagerIds = updateIdList(
      targetDept.managerIds,
      targetManager._id,
      sourceManager._id
    );
    const updatedSourceHodManagerIds = updateIdList(
      sourceHod.managedManagerIds,
      sourceManager._id,
      targetManager._id
    );
    const updatedTargetHodManagerIds = updateIdList(
      targetHod.managedManagerIds,
      targetManager._id,
      sourceManager._id
    );

    await Promise.all([
      Department.updateOne(
        { _id: sourceDept._id },
        { managerIds: updatedSourceDeptManagerIds },
        { session }
      ),
      Department.updateOne(
        { _id: targetDept._id },
        { managerIds: updatedTargetDeptManagerIds },
        { session }
      ),
      User.updateOne(
        { _id: sourceHod._id },
        { managedManagerIds: updatedSourceHodManagerIds },
        { session }
      ),
      User.updateOne(
        { _id: targetHod._id },
        { managedManagerIds: updatedTargetHodManagerIds },
        { session }
      ),
      User.updateOne(
        { _id: sourceManager._id },
        {
          role: 'manager',
          department: targetDept._id,
          departmentId: String(targetDept._id),
          managerId: null,
          managedMemberIds: targetMemberIds
        },
        { session }
      ),
      User.updateOne(
        { _id: targetManager._id },
        {
          role: 'manager',
          department: sourceDept._id,
          departmentId: String(sourceDept._id),
          managerId: null,
          managedMemberIds: sourceMemberIds
        },
        { session }
      )
    ]);


    if (sourceMemberIds.length > 0) {
      await User.updateMany(
        { _id: { $in: sourceMemberIds } },
        { managerId: String(targetManager._id) },
        { session }
      );
    }
    if (targetMemberIds.length > 0) {
      await User.updateMany(
        { _id: { $in: targetMemberIds } },
        { managerId: String(sourceManager._id) },
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: 'Manager exchange completed successfully',
      exchange: {
        sourceManagerId,
        targetManagerId,
        sourceDepartmentId: String(sourceDept._id),
        targetDepartmentId: String(targetDept._id)
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Exchange manager error:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.error || 'Failed to exchange manager',
      message: error.message || 'Internal server error'
    });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private (Admin, Super Admin, or self)
router.put('/:id', [
  body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  // Role validation (case-insensitive) - allow any case from frontend
  // Skip validation for empty string (checkFalsy) so blank values won't trigger "Invalid role"
  body('role').optional({ checkFalsy: true }).custom((value) => {
    const allowed = ['super_admin', 'admin', 'hr_manager', 'hr', 'department_head', 'manager', 'member', 'person'];
    if (!allowed.includes(String(value).toLowerCase())) {
      throw new Error('Invalid role');
    }
    return true;
  }),
  body('companyId').optional().isMongoId().withMessage('Invalid company ID'),
  body('departmentId').optional().custom((value) => {
    if (value === 'none' || value === null || value === undefined || value === '') {
      return true; // Allow 'none' as valid value
    }
    return require('mongoose').Types.ObjectId.isValid(value);
  }).withMessage('Invalid department ID'),
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
  }).withMessage('Invalid mobile number'),
  body('managerId').optional().custom((value) => {
    if (value === 'none' || value === null || value === undefined || value === '') {
      return true; // Allow 'none' as valid value
    }
    return require('mongoose').Types.ObjectId.isValid(value);
  }).withMessage('Invalid manager ID'),
  body('hodId').optional().custom((value) => {
    if (value === 'none' || value === null || value === undefined || value === '') {
      return true; // Allow 'none' as valid value
    }
    return require('mongoose').Types.ObjectId.isValid(value);
  }).withMessage('Invalid HOD ID'),
  body('role').optional().isIn(['super_admin', 'admin', 'hr_manager', 'hr', 'department_head', 'manager', 'member', 'person']).withMessage('Invalid role'),
  body('status').optional().isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status')
], async (req, res) => {
  try {
    console.log('PUT /api/users/:id - Request received:', {
      userId: req.params.id,
      body: req.body,
      user: req.user?.id
    });
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('User update validation errors:', errors.array());
      console.error('Request body:', req.body);
      return res.status(400).json({
        error: 'Validation failed',
        message: errors.array()[0].msg,
        details: errors.array()
      });
    }

    const userId = req.params.id;
    const requestingUser = req.user;
    const updateData = req.body;

    // Check if user can update this profile
    if (requestingUser.role !== 'super_admin' && 
        requestingUser.role !== 'admin' && 
        requestingUser.id !== userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update your own profile'
      });
    }

    // For company admins, ensure user belongs to their company
    if (requestingUser.role === 'admin' && requestingUser.id !== userId) {
      const user = await User.findById(userId);
      if (!user || user.companyId.toString() !== requestingUser.companyId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'User not found in your company'
        });
      }
    }

    // Check if email already exists (if updating email)
    if (updateData.email) {
      const existingUser = await User.findOne({ 
        email: updateData.email, 
        _id: { $ne: userId } 
      });
      if (existingUser) {
        return res.status(400).json({
          error: 'Email already exists',
          message: 'A user with this email already exists'
        });
      }
    }

    // HOD Change Validation
    if (updateData.role === 'department_head') {
      if (!updateData.departmentId) {
        return res.status(400).json({
          error: 'Department required for HOD',
          message: 'Department ID is required when assigning department head role'
        });
      }

      // Check if department exists
      const Department = require('../models/Department');
      const department = await Department.findById(updateData.departmentId);
      if (!department) {
        return res.status(400).json({
          error: 'Department not found',
          message: 'The specified department does not exist'
        });
      }
    }

    // For company admins, ensure they can only update users in their company
    if (requestingUser.role === 'admin' && updateData.companyId) {
      if (updateData.companyId !== requestingUser.companyId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only update users in your company'
        });
      }
    }

    // ============================================
    // IMPROVED USER UPDATE WITH ROLE CHANGE LOGIC
    // ============================================
    
    // Get the current user before update
    const previousUser = await User.findById(userId);
    if (!previousUser) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    console.log(`🔄 Updating user ${userId}:`, {
      previous: {
        role: previousUser.role,
        departmentId: previousUser.departmentId,
        managerId: previousUser.managerId
      },
      updated: {
        role: updateData.role,
        departmentId: updateData.departmentId,
        managerId: updateData.managerId,
        hodId: updateData.hodId
      }
    });

    // Start database transaction for atomicity
    const session = await User.startSession();
    session.startTransaction();
    let roleChangeProcessed = false;

    try {
      // ============================================
      // CASE 1: Change HOD (Department Head) - Complete Implementation
      // ============================================
      if (updateData.role === 'department_head' && previousUser.role !== 'department_head') {
        console.log('🎯 Case 1: Promoting user to Department Head');
        roleChangeProcessed = true;

        const deptId = updateData.departmentId;
        if (!deptId) {
          throw new Error('Department ID required when assigning department head role');
        }

        // ============================================
        // STEP 1: CLEANUP - Remove user from current relationships
        // ============================================
        console.log(`🧹 Step 1: Cleaning up current relationships for user ${userId}`);

        // 1a. Remove from Department memberIds/managerIds
        const Department = require('../models/Department');
        const currentDept = await Department.findById(previousUser.departmentId).session(session);
        
        if (currentDept) {
          // Remove from memberIds if user is member
          if (previousUser.role === 'member' && currentDept.memberIds) {
            currentDept.memberIds = currentDept.memberIds.filter(
              memberId => memberId.toString() !== userId
            );
            await currentDept.save({ session });
            console.log(`❌ Removed from department ${currentDept._id} memberIds`);
          }
          
          // Remove from managerIds if user is manager
          if (previousUser.role === 'manager' && currentDept.managerIds) {
            currentDept.managerIds = currentDept.managerIds.filter(
              managerId => managerId.toString() !== userId
            );
            await currentDept.save({ session });
            console.log(`❌ Removed from department ${currentDept._id} managerIds`);
          }
        }

        // 1b. Remove from current HOD's managedMemberIds
        if (previousUser.role === 'member' || previousUser.role === 'manager') {
          const currentHod = await User.findOne({
            role: 'department_head',
            departmentId: previousUser.departmentId
          }).session(session);

          if (currentHod) {
            if (currentHod.managedMemberIds) {
              currentHod.managedMemberIds = currentHod.managedMemberIds.filter(
                memberId => memberId.toString() !== userId
              );
              await currentHod.save({ session });
              console.log(`❌ Removed from current HOD ${currentHod._id} managedMemberIds`);
            }
          }
        }

        // 1c. Remove from current manager's managedMemberIds (if user is member)
        if (previousUser.role === 'member' && previousUser.managerId) {
          const currentManager = await User.findById(previousUser.managerId).session(session);
          if (currentManager && currentManager.managedMemberIds) {
            currentManager.managedMemberIds = currentManager.managedMemberIds.filter(
              memberId => memberId.toString() !== userId
            );
            await currentManager.save({ session });
            console.log(`❌ Removed from current manager ${currentManager._id} managedMemberIds`);
          }
        }

        // ============================================
        // STEP 2: TRANSFER - Handle existing HOD relationships
        // ============================================
        console.log(`🔄 Step 2: Transferring relationships from existing HOD`);

        // Find existing HOD for this department
        const prevHead = await User.findOne({
          role: 'department_head',
          departmentId: deptId,
          _id: { $ne: userId }
        }).session(session);

        if (prevHead) {
          console.log(`👑 Found previous HOD: ${prevHead._id}`);

          // Transfer all managed relationships from previous HOD to new HOD
          const managersToTransfer = prevHead.managedManagerIds || [];
          const membersToTransfer = prevHead.managedMemberIds || [];

          // Initialize arrays if not exist
          if (!updateData.managedManagerIds) updateData.managedManagerIds = [];
          if (!updateData.managedMemberIds) updateData.managedMemberIds = [];

          // Transfer managers (exclude the user becoming HOD)
          for (const managerId of managersToTransfer) {
            if (managerId.toString() !== userId && !updateData.managedManagerIds.includes(managerId)) {
              updateData.managedManagerIds.push(managerId);
            }
          }

          // Transfer members (exclude the user becoming HOD)
          for (const memberId of membersToTransfer) {
            if (memberId.toString() !== userId && !updateData.managedMemberIds.includes(memberId)) {
              updateData.managedMemberIds.push(memberId);
            }
          }

          console.log(`📋 Transferred ${managersToTransfer.length} managers and ${membersToTransfer.length} members`);

          // ============================================
          // STEP 3: CLEAR MANAGER RELATIONSHIPS - If Manager becoming HOD
          // ============================================
          if (previousUser.role === 'manager') {
            console.log(`🧹 Step 3: Clearing manager relationships for new HOD ${userId}`);
            
            // Clear managerId for all members who were managed by this manager
            const membersToClearManager = previousUser.managedMemberIds || [];
            if (membersToClearManager.length > 0) {
              await User.updateMany(
                { _id: { $in: membersToClearManager } },
                { managerId: null },
                { session }
              );
              console.log(`❌ Cleared managerId for ${membersToClearManager.length} members`);
            }
          }

          // Demote previous HOD to member and clear all relationships
          await User.updateOne(
            { _id: prevHead._id },
            {
              role: 'member',
              department: null,
              departmentId: null,
              managerId: null,
              managedManagerIds: [],
              managedMemberIds: []
            },
            { session }
          );

          console.log(`⬇️ Demoted previous HOD ${prevHead._id} to member`);
        }

        // ============================================
        // STEP 4: CLEAR NEW HOD'S MANAGER ID - Any role becoming HOD
        // ============================================
        console.log(`🧹 Step 4: Clearing managerId for new HOD ${userId}`);
        
        // Clear managerId for the user becoming HOD (HOD should not have a manager)
        updateData.managerId = null;
        console.log(`❌ Cleared managerId for new HOD ${userId}`);

        // Update department head reference
        const checkalreadymember = await Department.findOne({
          _id:deptId,
          memberIds:{$in:[userId]}
      });
        const deptUpdateResult = await Department.updateOne(
          { _id: deptId },
          { headId: userId },
          { session }
        );
        if (checkalreadymember) {
          await Department.updateOne(
            { _id: deptId },
            {
              $set: { headId: userId },   // safes update
              $pull: { memberIds: userId } // members array se hatao
            },
            { session }
          );
        }

        if (deptUpdateResult.matchedCount === 0) {
          throw new Error(`Department ${deptId} not found`);
        }

        console.log(`🏢 Updated department ${deptId} head to ${userId}`);
      }

      // ============================================
      // CASE 1B: HOD to HOD Change (New HOD Assignment)
      // ============================================
      else if (updateData.role === 'department_head' && previousUser.role === 'department_head' && 
               previousUser._id.toString() !== userId) {
        console.log('🔄 Case 1B: HOD to HOD Change - New HOD Assignment');
        roleChangeProcessed = true;

        const departmentId = updateData.departmentId;
        const oldHodId = previousUser._id;
        const newHodId = userId;

        // ============================================
        // STEP 1: CLEANUP - Remove new HOD from current relationships
        // ============================================
        console.log(`🧹 Step 1: Cleaning up current relationships for new HOD ${newHodId}`);

        // 1a. Remove from Department memberIds/managerIds
        const Department = require('../models/Department');
        const currentDept = await Department.findById(previousUser.departmentId).session(session);
        
        if (currentDept) {
          // Remove from memberIds if user is member
          if (previousUser.role === 'member' && currentDept.memberIds) {
            currentDept.memberIds = currentDept.memberIds.filter(
              memberId => memberId.toString() !== newHodId
            );
            await currentDept.save({ session });
            console.log(`❌ Removed from department ${currentDept._id} memberIds`);
          }
          
          // Remove from managerIds if user is manager
          if (previousUser.role === 'manager' && currentDept.managerIds) {
            currentDept.managerIds = currentDept.managerIds.filter(
              managerId => managerId.toString() !== newHodId
            );
            await currentDept.save({ session });
            console.log(`❌ Removed from department ${currentDept._id} managerIds`);
          }
        }

        // 1b. Remove from current HOD's managedMemberIds
        if (previousUser.role === 'member' || previousUser.role === 'manager') {
          const currentHod = await User.findOne({
            role: 'department_head',
            departmentId: previousUser.departmentId
          }).session(session);

          if (currentHod) {
            if (currentHod.managedMemberIds) {
              currentHod.managedMemberIds = currentHod.managedMemberIds.filter(
                memberId => memberId.toString() !== newHodId
              );
              await currentHod.save({ session });
              console.log(`❌ Removed from current HOD ${currentHod._id} managedMemberIds`);
            }
          }
        }

        // 1c. Remove from current manager's managedMemberIds (if user is member)
        if (previousUser.role === 'member' && previousUser.managerId) {
          const currentManager = await User.findById(previousUser.managerId).session(session);
          if (currentManager && currentManager.managedMemberIds) {
            currentManager.managedMemberIds = currentManager.managedMemberIds.filter(
              memberId => memberId.toString() !== newHodId
            );
            await currentManager.save({ session });
            console.log(`❌ Removed from current manager ${currentManager._id} managedMemberIds`);
          }
        }

        // ============================================
        // STEP 2: TRANSFER - Transfer all relationships from old HOD to new HOD
        // ============================================
        console.log(`🔄 Step 2: Transferring relationships from old HOD to new HOD`);

        // Step 1: Transfer all relationships from old HOD to new HOD
        const oldHod = await User.findById(oldHodId).session(session);
        
        if (oldHod) {
          // Transfer managed managers
          const managersToTransfer = oldHod.managedManagerIds || [];
          const membersToTransfer = oldHod.managedMemberIds || [];
          
          // Initialize new HOD's arrays
          if (!updateData.managedManagerIds) updateData.managedManagerIds = [];
          if (!updateData.managedMemberIds) updateData.managedMemberIds = [];
          
          // Transfer managers (exclude the user becoming HOD)
          for (const managerId of managersToTransfer) {
            if (managerId.toString() !== newHodId && !updateData.managedManagerIds.includes(managerId)) {
              updateData.managedManagerIds.push(managerId);
            }
          }
          
          // Transfer members (exclude the user becoming HOD)
          for (const memberId of membersToTransfer) {
            if (memberId.toString() !== newHodId && !updateData.managedMemberIds.includes(memberId)) {
              updateData.managedMemberIds.push(memberId);
            }
          }
          
          console.log(`📋 Transferred ${managersToTransfer.length} managers and ${membersToTransfer.length} members to new HOD`);
          
          // ============================================
          // STEP 3: CLEAR MANAGER RELATIONSHIPS - If Manager becoming HOD
          // ============================================
          if (previousUser.role === 'manager') {
            console.log(`🧹 Step 3: Clearing manager relationships for new HOD ${newHodId}`);
            
            // Clear managerId for all members who were managed by this manager
            const membersToClearManager = previousUser.managedMemberIds || [];
            if (membersToClearManager.length > 0) {
              await User.updateMany(
                { _id: { $in: membersToClearManager } },
                { managerId: null },
                { session }
              );
              console.log(`❌ Cleared managerId for ${membersToClearManager.length} members`);
            }
          }
          
          // Step 2: Clear old HOD's relationships and make him Member
          await User.updateOne(
            { _id: oldHodId },
            {
              role: 'member',
              departmentId: null,           // No department
              managerId: null,              // No manager
              managedManagerIds: [],        // Clear all managed managers
              managedMemberIds: [],         // Clear all managed members
              isActive: true
            },
            { session }
          );
          
          console.log(`👤 Old HOD ${oldHodId} converted to Member with no department`);
        }
        
        // ============================================
        // STEP 4: CLEAR NEW HOD'S MANAGER ID - Any role becoming HOD
        // ============================================
        console.log(`🧹 Step 4: Clearing managerId for new HOD ${newHodId}`);
        
        // Clear managerId for the user becoming HOD (HOD should not have a manager)
        updateData.managerId = null;
        console.log(`❌ Cleared managerId for new HOD ${newHodId}`);
        
        // Step 3: Update Department head reference
        await Department.updateOne(
          { _id: departmentId },
          { headId: newHodId },
          { session }
        );
        
        console.log(`🏢 Department ${departmentId} head updated to ${newHodId}`);
      }

  // ============================================
  // CASE 1C: HOD Demotion (HOD to Manager/Member)
  // ============================================
  else if (previousUser.role === 'department_head' && updateData.role !== 'department_head') {
    console.log('🎯 CASE 1C TRIGGERED: HOD Demotion');

    // 🚫 VALIDATION: HOD cannot change role within same department
    const oldDepartmentId = previousUser.departmentId;
    const newDepartmentId = updateData.departmentId || oldDepartmentId;

    if (newDepartmentId.toString() === oldDepartmentId.toString()) {
      throw new Error('HOD cannot change role within the same department. HOD must either stay as HOD or move to a different department.');
    }

    console.log('⬇️ Case 1C: HOD Demotion');
    roleChangeProcessed = true;

    const hodId = previousUser._id;

    // Step 1: Clear all HOD relationships
    updateData.managedManagerIds = [];
    updateData.managedMemberIds = [];

    // Step 2: Update OLD Department head reference to null (since department is changing)
    await Department.updateOne(
      { _id: oldDepartmentId },
      { headId: null },
      { session }
    );

    console.log(`🏢 Department ${oldDepartmentId} head cleared (HOD demoted)`);

    // Step 3: Create new relationships based on target role
    if (updateData.role === 'manager') {
          // Add to NEW department managerIds
          await Department.updateOne(
            { _id: newDepartmentId },
            { $addToSet: { managerIds: hodId } },
            { session }
          );
          console.log(`✅ Added demoted HOD to department ${newDepartmentId} managerIds`);

          // Find a suitable HOD for the NEW department
          console.log(`🔍 Looking for HOD in new department: ${newDepartmentId}`);
          const existingHod = await User.findOne({
            role: 'department_head',
            departmentId: newDepartmentId,
            _id: { $ne: hodId }
          }).session(session);

          console.log(`📊 Found existing HOD:`, existingHod ? existingHod._id : 'NONE');

          // Manager should not have a manager - set managerId to null
          updateData.managerId = null;
          console.log(`❌ Set Manager's managerId to null (Manager should not have manager)`);

          if (existingHod) {
            // Add to existing HOD's managedManagerIds (but managerId remains null)
            if (!existingHod.managedManagerIds) existingHod.managedManagerIds = [];
            console.log(`📊 Existing HOD managedManagerIds before:`, existingHod.managedManagerIds);

            if (!existingHod.managedManagerIds.includes(hodId)) {
              existingHod.managedManagerIds.push(hodId);
              console.log(`📊 Existing HOD managedManagerIds after push:`, existingHod.managedManagerIds);

              await existingHod.save({ session });
              console.log(`✅ Added demoted HOD to existing HOD ${existingHod._id} managedManagerIds`);
            } else {
              console.log(`ℹ️ HOD already in managedManagerIds`);
            }
          }
        }
        else if (updateData.role === 'member') {
          // Add to NEW department memberIds
          await Department.updateOne(
            { _id: newDepartmentId },
            { $addToSet: { memberIds: hodId } },
            { session }
          );
          console.log(`✅ Added demoted HOD to department ${newDepartmentId} memberIds`);

          // Member should not have managerId set - it's assigned by business logic
          updateData.managerId = null;
          console.log(`❌ Set Member's managerId to null (Member managerId assigned by business logic)`);

          // Find HOD for the NEW department to add to managedMemberIds
          const existingHod = await User.findOne({
            role: 'department_head',
            departmentId: newDepartmentId,
            _id: { $ne: hodId }
          }).session(session);

          // Add to existing HOD's managedMemberIds (if exists)
          if (existingHod) {
            if (!existingHod.managedMemberIds) existingHod.managedMemberIds = [];
            if (!existingHod.managedMemberIds.includes(hodId)) {
              existingHod.managedMemberIds.push(hodId);
              await existingHod.save({ session });
              console.log(`✅ Added demoted HOD to existing HOD ${existingHod._id} managedMemberIds`);
            }
          }
        }

        console.log(`⬇️ HOD ${hodId} demoted to ${updateData.role}`);

        // Update the demoted user
        await User.updateOne(
          { _id: hodId },
          {
            role: updateData.role,
            departmentId: newDepartmentId,
            managerId: updateData.managerId,
            managedManagerIds: updateData.managedManagerIds,
            managedMemberIds: updateData.managedMemberIds
          },
          { session }
        );

        console.log(`✅ User ${hodId} updated to role ${updateData.role}`);

        // Debug logging
        console.log('🔍 HOD Demotion Debug:');
        console.log('  - Target role:', updateData.role);
        console.log('  - Old Department ID:', oldDepartmentId);
        console.log('  - New Department ID:', newDepartmentId);
        console.log('  - Demoted user ID:', hodId);
      }

      // ============================================
      // CASE 1D: Manager Assignment (HR/Member/Person/HOD to Manager)
      // ============================================
      else if (updateData.role === 'manager' && previousUser.role !== 'manager') {
        console.log('🎯 CASE 1D TRIGGERED: Manager Assignment');
        roleChangeProcessed = true;

        const previousRole = previousUser.role;
        console.log(`🔄 Converting ${previousRole} to Manager`);

        // ============================================
        // STEP 1: CLEANUP - Clear previous role relationships
        // ============================================
        console.log(`🧹 Step 1: Cleaning up ${previousRole} relationships`);

        // 1a. HR to Manager - Clear HR relationships
        if (previousRole === 'hr') {
          updateData.managedManagerIds = [];
          updateData.managedMemberIds = [];
          console.log(`🧹 Cleared HR relationships for user ${userId}`);
        }

        // 1b. Member to Manager - Remove from member relationships
        else if (previousRole === 'member') {
          // Remove from department memberIds
          if (previousUser.departmentId) {
            await Department.updateOne(
              { _id: previousUser.departmentId },
              { $pull: { memberIds: userId } },
              { session }
            );
            console.log(`❌ Removed from department ${previousUser.departmentId} memberIds`);
          }

          // Remove from previous manager's managedMemberIds
          if (previousUser.managerId) {
            const prevManager = await User.findById(previousUser.managerId).session(session);
            if (prevManager && prevManager.managedMemberIds) {
              prevManager.managedMemberIds = prevManager.managedMemberIds.filter(
                id => id.toString() !== userId
              );
              await prevManager.save({ session });
              console.log(`❌ Removed from previous manager ${prevManager._id} managedMemberIds`);
            }
          }

          // Remove from previous HOD's managedMemberIds (if member was under HOD)
          if (previousUser.departmentId) {
            const prevHod = await User.findOne({
              role: 'department_head',
              departmentId: previousUser.departmentId
            }).session(session);

            if (prevHod && prevHod.managedMemberIds) {
              prevHod.managedMemberIds = prevHod.managedMemberIds.filter(
                id => id.toString() !== userId
              );
              await prevHod.save({ session });
              console.log(`❌ Removed from previous HOD ${prevHod._id} managedMemberIds`);
            }
          }
        }

        // 1c. Person to Manager - Clear person relationships
        else if (previousRole === 'person') {
          updateData.managedManagerIds = [];
          updateData.managedMemberIds = [];
          console.log(`🧹 Cleared Person relationships for user ${userId}`);
        }

        // 1d. HOD to Manager - Clear HOD relationships
        else if (previousRole === 'department_head') {
          updateData.managedManagerIds = [];
          updateData.managedMemberIds = [];

          // Clear department head reference
          if (previousUser.departmentId) {
            await Department.updateOne(
              { _id: previousUser.departmentId },
              { headId: null },
              { session }
            );
            console.log(`❌ Cleared department head reference for department ${previousUser.departmentId}`);
          }
        }

        // ============================================
        // STEP 2: SETUP - Add Manager relationships
        // ============================================
        console.log(`🔧 Step 2: Setting up Manager relationships`);

        // 2a. Add to department managerIds
        if (updateData.departmentId) {
          await Department.updateOne(
            { _id: updateData.departmentId },
            { $addToSet: { managerIds: userId } },
            { session }
          );
          console.log(`✅ Added to department ${updateData.departmentId} managerIds`);
        }

        // 2b. Add to HOD's managedManagerIds (automatically find HOD)
        if (updateData.departmentId) {
          const hod = await User.findOne({
            role: 'department_head',
            departmentId: updateData.departmentId
          }).session(session);

          if (hod) {
            if (!hod.managedManagerIds) hod.managedManagerIds = [];
            if (!hod.managedManagerIds.includes(userId)) {
              hod.managedManagerIds.push(userId);
              await hod.save({ session });
              console.log(`✅ Added to HOD ${hod._id} managedManagerIds`);
            }
          }
        }

        console.log(`✅ ${previousRole} ${userId} successfully converted to Manager`);
      }

      // ============================================
      // CASE 1E: Member Assignment (Any Role to Member)
      // ============================================
      else if (updateData.role === 'member' && previousUser.role !== 'member') {
        console.log('🎯 CASE 1E TRIGGERED: Member Assignment');
        roleChangeProcessed = true;

        const previousRole = previousUser.role;
        console.log(`🔄 Converting ${previousRole} to Member`);

        // ============================================
        // STEP 1: CLEANUP - Clear previous role relationships
        // ============================================
        console.log(`🧹 Step 1: Cleaning up ${previousRole} relationships`);

        // 1a. HR to Member - Clear HR relationships
        if (previousRole === 'hr') {
          updateData.managedManagerIds = [];
          updateData.managedMemberIds = [];
          console.log(`🧹 Cleared HR relationships for user ${userId}`);
        }

        // 1b. Manager to Member - Remove from manager relationships
        else if (previousRole === 'manager') {
          // Remove from department managerIds
          if (previousUser.departmentId) {
            await Department.updateOne(
              { _id: previousUser.departmentId },
              { $pull: { managerIds: userId } },
              { session }
            );
            console.log(`❌ Removed from department ${previousUser.departmentId} managerIds`);
          }

          // Remove from HOD's managedManagerIds
          if (previousUser.departmentId) {
            const hod = await User.findOne({
              role: 'department_head',
              departmentId: previousUser.departmentId
            }).session(session);

            if (hod && hod.managedManagerIds) {
              hod.managedManagerIds = hod.managedManagerIds.filter(
                id => id.toString() !== userId
              );
              await hod.save({ session });
              console.log(`❌ Removed from HOD ${hod._id} managedManagerIds`);
            }
          }

          // Clear all managed relationships
          updateData.managedManagerIds = [];
          updateData.managedMemberIds = [];
        }

        // 1c. Person to Member - Clear person relationships
        else if (previousRole === 'person') {
          updateData.managedManagerIds = [];
          updateData.managedMemberIds = [];
          console.log(`🧹 Cleared Person relationships for user ${userId}`);
        }

        // 1d. HOD to Member - Clear HOD relationships
        else if (previousRole === 'department_head') {
          updateData.managedManagerIds = [];
          updateData.managedMemberIds = [];

          // Clear department head reference
          if (previousUser.departmentId) {
            await Department.updateOne(
              { _id: previousUser.departmentId },
              { headId: null },
              { session }
            );
            console.log(`❌ Cleared department head reference for department ${previousUser.departmentId}`);
          }
        }

        // ============================================
        // STEP 2: SETUP - Add Member relationships
        // ============================================
        console.log(`🔧 Step 2: Setting up Member relationships`);

        // 2a. Add to department memberIds
        if (updateData.departmentId) {
          await Department.updateOne(
            { _id: updateData.departmentId },
            { $addToSet: { memberIds: userId } },
            { session }
          );
          console.log(`✅ Added to department ${updateData.departmentId} memberIds`);
        }

        // 2b. Add to HOD's managedMemberIds (automatically find HOD)
        if (updateData.departmentId) {
          const hod = await User.findOne({
            role: 'department_head',
            departmentId: updateData.departmentId
          }).session(session);

          if (hod) {
            if (!hod.managedMemberIds) hod.managedMemberIds = [];
            if (!hod.managedMemberIds.includes(userId)) {
              hod.managedMemberIds.push(userId);
              await hod.save({ session });
              console.log(`✅ Added to HOD ${hod._id} managedMemberIds`);
            }
          }
        }

        // 2c. Add to Manager's managedMemberIds (if managerId provided)
        if (updateData.managerId) {
          const manager = await User.findById(updateData.managerId).session(session);
          if (manager) {
            if (!manager.managedMemberIds) manager.managedMemberIds = [];
            if (!manager.managedMemberIds.includes(userId)) {
              manager.managedMemberIds.push(userId);
              await manager.save({ session });
              console.log(`✅ Added to Manager ${manager._id} managedMemberIds`);
            }
          }
        }

        // 2d. Set Member's managerId (if provided, otherwise null)
        if (!updateData.managerId) {
          updateData.managerId = null;
          console.log(`❌ Set Member's managerId to null (no manager assigned)`);
        }

        console.log(`✅ ${previousRole} ${userId} successfully converted to Member`);
      }

      // ============================================
      // CASE 2: Manager Department Change
      // ============================================
      else if (previousUser.role === 'manager' && updateData.role === 'manager' &&
               previousUser.departmentId !== updateData.departmentId) {
        console.log('👨‍💼 Case 2: Manager changing departments');
        roleChangeProcessed = true;

        const oldDeptId = previousUser.departmentId;
        const newDeptId = updateData.departmentId;

        if (!oldDeptId || !newDeptId) {
          throw new Error('Both old and new department IDs required for manager department change');
        }

        // Find old and new HODs
        const [oldHod, newHod] = await Promise.all([
          User.findOne({ role: 'department_head', departmentId: oldDeptId }).session(session),
          User.findOne({ role: 'department_head', departmentId: newDeptId }).session(session)
        ]);

        if (!newHod) {
          throw new Error(`No department head found for new department ${newDeptId}`);
        }

        // Remove from old department's managerIds
        await Department.updateOne(
          { _id: oldDeptId },
          { $pull: { managerIds: userId } },
          { session }
        );
        console.log(`❌ Removed manager from old department ${oldDeptId} managerIds`);

        // Add to new department's managerIds
        await Department.updateOne(
          { _id: newDeptId },
          { $addToSet: { managerIds: userId } },
          { session }
        );
        console.log(`✅ Added manager to new department ${newDeptId} managerIds`);

        // Remove from old HOD's managedManagerIds
        if (oldHod) {
          const oldHodUpdated = await User.findById(oldHod._id).session(session);
          if (oldHodUpdated && oldHodUpdated.managedManagerIds) {
            oldHodUpdated.managedManagerIds = oldHodUpdated.managedManagerIds.filter(
              managerId => managerId.toString() !== userId
            );
            await oldHodUpdated.save({ session });
            console.log(`❌ Removed manager from old HOD ${oldHod._id} managedManagerIds`);
          }
        }

        // Add to new HOD's managedManagerIds
        const newHodUpdated = await User.findById(newHod._id).session(session);
        if (newHodUpdated) {
          if (!newHodUpdated.managedManagerIds) newHodUpdated.managedManagerIds = [];
          if (!newHodUpdated.managedManagerIds.includes(userId)) {
            newHodUpdated.managedManagerIds.push(userId);
            await newHodUpdated.save({ session });
            console.log(`✅ Added manager to new HOD ${newHod._id} managedManagerIds`);
          }
        }

        // Manager should not have a manager - ensure managerId is null
        updateData.managerId = null;
        console.log(`❌ Set Manager's managerId to null (Manager should not have manager)`);
      }

      // ============================================
      // CASE 3: Member Department Change (MOST IMPORTANT)
      // ============================================
      else if (previousUser.role === 'member' && updateData.role === 'member' &&
               previousUser.departmentId !== updateData.departmentId) {
        console.log('👤 Case 3: Member changing departments (MOST CRITICAL)');
        roleChangeProcessed = true;

        const oldDeptId = previousUser.departmentId;
        const newDeptId = updateData.departmentId;

        if (!oldDeptId || !newDeptId) {
          throw new Error('Both old and new department IDs required for member department change');
        }

        console.log(`📍 Moving from department ${oldDeptId} to ${newDeptId}`);

        // 1. Find old and new HODs
        const [oldHod, newHod] = await Promise.all([
          User.findOne({ role: 'department_head', departmentId: oldDeptId }).session(session),
          User.findOne({ role: 'department_head', departmentId: newDeptId }).session(session)
        ]);

        if (!newHod) {
          throw new Error(`No department head found for new department ${newDeptId}`);
        }

        // 🗑️ STEP 1: CLEANUP - Remove from OLD department relationships

        // 1a. Remove from OLD department's memberIds
        await Department.updateOne(
          { _id: oldDeptId },
          { $pull: { memberIds: userId } },
          { session }
        );
        console.log(`❌ Removed member from old department ${oldDeptId} memberIds`);

        // 1b. Remove from old HOD's managedMemberIds
        if (oldHod) {
          const oldHodUpdated = await User.findById(oldHod._id).session(session);
          if (oldHodUpdated && oldHodUpdated.managedMemberIds) {
            oldHodUpdated.managedMemberIds = oldHodUpdated.managedMemberIds.filter(
              memberId => memberId.toString() !== userId
            );
            await oldHodUpdated.save({ session });
            console.log(`❌ Removed from old HOD ${oldHod._id} managedMemberIds`);
          }
        } else {
          console.warn(`⚠️ No HOD found for old department ${oldDeptId}`);
        }

        // 1c. Remove from previous manager's managedMemberIds (if had a manager)
        if (previousUser.managerId) {
          const prevManager = await User.findById(previousUser.managerId).session(session);
          if (prevManager && prevManager.managedMemberIds) {
            prevManager.managedMemberIds = prevManager.managedMemberIds.filter(
              memberId => memberId.toString() !== userId
            );
            await prevManager.save({ session });
            console.log(`❌ Removed from old manager ${prevManager._id} managedMemberIds`);
          }
        }

        // ➕ STEP 2: SETUP - Add to NEW department relationships

        // 2a. Add to NEW department's memberIds
        await Department.updateOne(
          { _id: newDeptId },
          { $addToSet: { memberIds: userId } },
          { session }
        );
        console.log(`✅ Added member to new department ${newDeptId} memberIds`);

        // 2b. Add to new HOD's managedMemberIds
        const newHodUpdated = await User.findById(newHod._id).session(session);
        if (newHodUpdated) {
          if (!newHodUpdated.managedMemberIds) newHodUpdated.managedMemberIds = [];
          if (!newHodUpdated.managedMemberIds.includes(userId)) {
            newHodUpdated.managedMemberIds.push(userId);
            await newHodUpdated.save({ session });
            console.log(`➕ Added to new HOD ${newHod._id} managedMemberIds`);
          }
        }

        // 2c. Add to new manager's managedMemberIds (if new manager assigned)
        if (updateData.managerId) {
          const newManager = await User.findById(updateData.managerId).session(session);
          if (newManager) {
            if (!newManager.managedMemberIds) newManager.managedMemberIds = [];
            if (!newManager.managedMemberIds.includes(userId)) {
              newManager.managedMemberIds.push(userId);
              await newManager.save({ session });
              console.log(`➕ Added to new manager ${newManager._id} managedMemberIds`);
            }
          } else {
            console.warn(`⚠️ New manager ${updateData.managerId} not found`);
          }
        } else {
          console.log(`ℹ️ No new manager assigned - member reports directly to HOD`);
        }

        // 2d. Sync member tasks/meetings to new department for HOD visibility
        const taskMatch = {
          $and: [
            { $or: [{ assignedTo: userId }, { assignedToList: userId }] },
            { $or: [
                { departmentId: oldDeptId },
                { departmentId: null },
                { departmentId: { $exists: false } }
              ] }
          ]
        };

        const taskUpdateResult = await Task.updateMany(
          taskMatch,
          { $set: { departmentId: newDeptId } },
          { session }
        );
        const updatedTaskCount = typeof taskUpdateResult.modifiedCount === 'number'
          ? taskUpdateResult.modifiedCount
          : taskUpdateResult.nModified || 0;
        console.log(`🔁 Synced ${updatedTaskCount} tasks to new department ${newDeptId}`);

        const meetingMatch = {
          $or: [
            { inviteeUserIds: userId },
            { 'participants.user': userId }
          ]
        };
        const meetingUpdateResult = await Meeting.updateMany(
          meetingMatch,
          { $addToSet: { departmentIds: newDeptId } },
          { session }
        );
        const updatedMeetingCount = typeof meetingUpdateResult.modifiedCount === 'number'
          ? meetingUpdateResult.modifiedCount
          : meetingUpdateResult.nModified || 0;
        console.log(`📅 Added department ${newDeptId} to ${updatedMeetingCount} meetings for member visibility`);

        console.log(`✅ Member department change completed for user ${userId}`);
        console.log(`📊 Summary: Removed from old dept ${oldDeptId}, added to new dept ${newDeptId}`);
      }

      // ============================================
      // UPDATE THE MAIN USER RECORD
      // ============================================
      console.log(`💾 Updating main user record for ${userId}`);

      // Ensure the stored `name` field stays in sync when firstName/lastName are updated
      if (updateData.firstName || updateData.lastName) {
        const newFirst = updateData.firstName || previousUser.firstName || '';
        const newLast = updateData.lastName || previousUser.lastName || '';
        updateData.name = `${newFirst} ${newLast}`.trim();
      }

      // Keep department ObjectId in sync when departmentId provided
      if (updateData.departmentId) {
        updateData.department = updateData.departmentId;
      }

      const user = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true, session }
      )
      .populate('companyId', 'name domain')
      .populate('department', 'name')
      .select('-password -failedLoginAttempts -lockedUntil');

      if (!user) {
        throw new Error('Failed to update user record');
      }

      // Commit the transaction
      await session.commitTransaction();

      console.log(`✅ User ${userId} updated successfully`);
      if (roleChangeProcessed) {
        console.log(`🔄 Role change logic executed for user ${userId}`);
      }

    } catch (error) {
      // Abort transaction on error
      console.error('❌ Transaction failed:', error);
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        status: user.status,
        avatar: user.avatar,
        phone: user.phone,
        mobileNumber: user.mobileNumber,
        department: user.department ? user.department : user.departmentId,
        departmentId: user.departmentId,
        managerId: user.managerId,
        company: user.companyId,
        lastLogin: user.lastLogin,
        lastActive: user.lastActive,
        updatedAt: user.updatedAt,
        managedManagerIds: user.managedManagerIds || [],
        managedMemberIds: user.managedMemberIds || []
      },
      roleChangeProcessed: roleChangeProcessed
    });

  } catch (error) {
    console.error('💥 Update user error:', error);
    
    // Determine appropriate error status
    let statusCode = 500;
    if (error.message.includes('not found')) {
      statusCode = 404;
    } else if (error.message.includes('Validation') || error.message.includes('required')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      error: 'Failed to update user',
      message: error.message || 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete user
// @access  Private (Admin, Super Admin)
router.delete('/:id', requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const userId = req.params.id;
    const requestingUser = req.user;

    // Check if trying to delete self
    if (requestingUser.id === userId) {
      return res.status(400).json({
        error: 'Cannot delete self',
        message: 'You cannot delete your own account'
      });
    }

    // For company admins, ensure user belongs to their company
    if (requestingUser.role === 'admin') {
      const user = await User.findById(userId);
      if (!user || user.companyId.toString() !== requestingUser.companyId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'User not found in your company'
        });
      }
    }

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      error: 'Failed to delete user',
      message: 'Internal server error'
    });
  }
});

// @route   PATCH /api/users/:id/status
// @desc    Update user status
// @access  Private (Admin, Super Admin)
router.patch('/:id/status', [
  requireRole(['admin', 'super_admin']),
  body('status').isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status')
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

    const userId = req.params.id;
    const { status } = req.body;
    const requestingUser = req.user;

    // Check if trying to update self
    if (requestingUser.id === userId) {
      return res.status(400).json({
        error: 'Cannot update self',
        message: 'You cannot update your own status'
      });
    }

    // For company admins, ensure user belongs to their company
    if (requestingUser.role === 'admin') {
      const user = await User.findById(userId);
      if (!user || user.companyId.toString() !== requestingUser.companyId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'User not found in your company'
        });
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { status },
      { new: true }
    )
    .populate('companyId', 'name domain')
    .select('-password -failedLoginAttempts -lockedUntil');

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User status updated successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        status: user.status,
        updatedAt: user.updatedAt
      }
    });

  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      error: 'Failed to update user status',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/users/stats
// @desc    Get user statistics
// @access  Private (Admin, Super Admin)
router.get('/stats', requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { companyId } = req.query;
    const requestingUser = req.user;

    // Build filter query
    const filter = {};

    // Company filter (for company admins) - allow matching by ObjectId or string
    if (requestingUser.role === 'admin') {
      try {
        const cid = mongoose.Types.ObjectId(requestingUser.companyId);
        filter.$or = [{ companyId: cid }, { companyId: String(requestingUser.companyId) }];
      } catch (e) {
        filter.companyId = requestingUser.companyId;
      }
    } else if (companyId) {
      try {
        const cid = mongoose.Types.ObjectId(companyId);
        filter.$or = [{ companyId: cid }, { companyId: String(companyId) }];
      } catch (e) {
        // companyId not a valid ObjectId, match as string
        filter.companyId = companyId;
      }
    }

    // Get user statistics
    const totalUsers = await User.countDocuments(filter);
    const activeUsers = await User.countDocuments({ ...filter, status: 'active' });
    const inactiveUsers = await User.countDocuments({ ...filter, status: 'inactive' });
    const suspendedUsers = await User.countDocuments({ ...filter, status: 'suspended' });

    // Get users by role
    const usersByRole = await User.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get recent users (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentUsers = await User.countDocuments({
      ...filter,
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Get users with recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const activeUsers7Days = await User.countDocuments({
      ...filter,
      lastActive: { $gte: sevenDaysAgo }
    });

    res.status(200).json({
      success: true,
      stats: {
        total: totalUsers,
        active: activeUsers,
        inactive: inactiveUsers,
        suspended: suspendedUsers,
        recent: recentUsers,
        active7Days: activeUsers7Days,
        byRole: usersByRole.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      }
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      error: 'Failed to get user statistics',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/users/:id/avatar
// @desc    Upload user avatar
// @access  Private (Self or Admin)
router.post('/:id/avatar', upload.single('avatar'), async (req, res) => {
  // Set longer timeout for file uploads
  req.setTimeout(120000); // 2 minutes
  res.setTimeout(120000); // 2 minutes
  try {
    const userId = req.params.id;
    const requestingUser = req.user;

    // Check permissions - user can update their own avatar or admin can update anyone's
    if (requestingUser.role !== 'super_admin' &&
        requestingUser.role !== 'admin' &&
        requestingUser.id !== userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update your own avatar'
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

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    // For company admins, ensure user belongs to their company
    if (requestingUser.role === 'admin' && user.companyId.toString() !== requestingUser.companyId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'User not found in your company'
      });
    }

    console.log('Uploading avatar for user:', userId, 'file:', req.file.originalname);

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
      folder: 'user-avatars',
      public_id: `user-${userId}-${Date.now()}`,
      timeout: 60000, // 60 second timeout
      transformation: [
        { width: 300, height: 300, crop: 'fill', gravity: 'auto' },
        { quality: 'auto', format: 'jpg' }
      ]
    };

    console.log('Starting Cloudinary upload with options:', uploadOptions);
    const result = await uploadBufferToCloudinary(req.file.buffer, uploadOptions);
    console.log('Avatar upload successful:', result.secure_url || result.url);

    // Validate the result
    if (!result || !result.secure_url) {
      throw new Error('Cloudinary upload failed - no URL returned');
    }

    // Update user avatar in database
    user.avatar = result.secure_url || result.url;
    await user.save();

    res.json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: {
        avatar: user.avatar,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar
        }
      }
    });

  } catch (error) {
    console.error('Avatar upload error:', error);

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

// @route   PUT /api/users/:id/change-password
// @desc    Admin endpoint to change user password
// @access  Private (Admin only)
router.put('/:id/change-password', [
  requireRole(['admin', 'super_admin']),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
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

    const userId = req.params.id;
    const { newPassword } = req.body;
    const requestingUser = req.user;

    // Prevent admin from changing their own password through this endpoint
    // They should use the regular change-password endpoint
    if (requestingUser.id === userId) {
      return res.status(400).json({
        error: 'Cannot change own password',
        message: 'Use the regular change-password endpoint to change your own password'
      });
    }

    // For regular admins, ensure user belongs to their company
    if (requestingUser.role === 'admin') {
      const user = await User.findById(userId);
      if (!user || user.companyId.toString() !== requestingUser.companyId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'User not found in your company'
        });
      }
    }

    // Hash the new password
    const bcrypt = require('bcryptjs');
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update user password and set passwordChangedAt
    const user = await User.findByIdAndUpdate(
      userId,
      {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        // Clear any failed login attempts
        failedLoginAttempts: 0,
        lockedUntil: null
      },
      { new: true }
    )
    .populate('companyId', 'name domain')
    .select('-password -failedLoginAttempts -lockedUntil');

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    // Log this action for security
    console.log(`🔐 Admin ${requestingUser.email} changed password for user ${user.email} at ${new Date().toISOString()}`);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        status: user.status,
        passwordChangedAt: user.passwordChangedAt
      }
    });

  } catch (error) {
    console.error('Admin change password error:', error);
    res.status(500).json({
      error: 'Failed to change password',
      message: 'Internal server error'
    });
  }
});

module.exports = router;








