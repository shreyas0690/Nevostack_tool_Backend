const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const rateLimit = require('express-rate-limit');
const { User, Task, Department, Leave, Meeting } = require('../models');
const { requireRole } = require('../middleware/auth');

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

const router = express.Router();

// Helper function to populate task query
const populateTaskQuery = (query) => query
  .populate('assignedTo', 'firstName lastName email role position')
  .populate('assignedBy', 'firstName lastName email role')
  .populate('companyId', 'name')
  .populate('departmentId', 'name');

// Helper function to get member task statistics
const getMemberTaskStats = async (memberId, companyId) => {
  const memberObjectId = new mongoose.Types.ObjectId(memberId);

  // Total tasks assigned to the member
  const totalTasks = await Task.countDocuments({
    assignedTo: memberObjectId,
    companyId: companyId
  });

  // Completed tasks
  const completedTasks = await Task.countDocuments({
    assignedTo: memberObjectId,
    companyId: companyId,
    status: 'completed'
  });

  // Pending tasks (assigned or in_progress)
  const pendingTasks = await Task.countDocuments({
    assignedTo: memberObjectId,
    companyId: companyId,
    status: { $in: ['assigned', 'in_progress'] }
  });

  // Today's tasks
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  const todayTasks = await Task.countDocuments({
    assignedTo: memberObjectId,
    companyId: companyId,
    dueDate: {
      $gte: startOfToday,
      $lt: endOfToday
    },
    status: { $nin: ['completed', 'cancelled'] }
  });

  // Overdue tasks
  const overdueTasks = await Task.countDocuments({
    assignedTo: memberObjectId,
    companyId: companyId,
    dueDate: { $lt: new Date() },
    status: { $nin: ['completed', 'cancelled', 'blocked'] }
  });

  // Urgent tasks
  const urgentTasks = await Task.countDocuments({
    assignedTo: memberObjectId,
    companyId: companyId,
    priority: 'urgent',
    status: { $nin: ['completed', 'cancelled'] }
  });

  // Recent tasks (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentTasks = await Task.countDocuments({
    assignedTo: memberObjectId,
    companyId: companyId,
    createdAt: { $gte: sevenDaysAgo }
  });

  // Completion rate
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Today's completion rate (tasks due today)
  const todayCompletedTasks = await Task.countDocuments({
    assignedTo: memberObjectId,
    companyId: companyId,
    dueDate: {
      $gte: startOfToday,
      $lt: endOfToday
    },
    status: 'completed'
  });

  // Tasks completed today (regardless of due date) - shows productivity
  const tasksCompletedToday = await Task.countDocuments({
    assignedTo: memberObjectId,
    companyId: companyId,
    status: 'completed',
    updatedAt: {
      $gte: startOfToday,
      $lt: endOfToday
    }
  });

  // Calculate today's progress with multiple metrics
  const totalTasksDueToday = todayTasks.length + todayCompletedTasks;
  const todayDueCompletionRate = totalTasksDueToday > 0 ? Math.round((todayCompletedTasks / totalTasksDueToday) * 100) : 0;

  // Overall today's progress score (weighted average)
  let todayProgressScore = 0;
  if (totalTasksDueToday > 0 && tasksCompletedToday > 0) {
    // Weight: 70% due date completion + 30% general productivity
    todayProgressScore = Math.round((todayDueCompletionRate * 0.7) + (Math.min(tasksCompletedToday * 10, 100) * 0.3));
  } else if (totalTasksDueToday > 0) {
    todayProgressScore = todayDueCompletionRate;
  } else if (tasksCompletedToday > 0) {
    todayProgressScore = Math.min(tasksCompletedToday * 10, 100);
  }

  return {
    total: totalTasks,
    completed: completedTasks,
    pending: pendingTasks,
    today: todayTasks,
    overdue: overdueTasks,
    urgent: urgentTasks,
    recent: recentTasks,
    completionRate,
    todayCompletionRate: todayProgressScore, // Updated with improved logic
    todayDueCompletionRate, // Additional metric for tasks due today
    tasksCompletedToday // Additional metric for productivity
  };
};

// GET /api/members/dashboard
// Access: member (and higher roles)
router.get('/dashboard', async (req, res) => {
  try {
    const memberId = req.user.id;
    const companyId = req.user.companyId;
    const memberObjectId = new mongoose.Types.ObjectId(memberId);

    // Get member basic info
    const member = await User.findById(memberId)
      .select('firstName lastName email role position department manager managerId')
      .populate('department', 'name color')
      .populate('manager', 'firstName lastName email role');
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    if (!member.manager && member.managerId) {
      const fallbackManager = await User.findById(member.managerId)
        .select('firstName lastName email role');
      if (fallbackManager) {
        member.manager = fallbackManager;
      }
    }

    // Get task statistics
    const taskStats = await getMemberTaskStats(memberId, companyId);

    // Get recent tasks (last 5)
    const recentTasks = await populateTaskQuery(Task.find({
      assignedTo: memberObjectId,
      companyId: companyId
    }).sort({ createdAt: -1 }).limit(5));

    // Get urgent tasks (limit 5)
    const urgentTasks = await populateTaskQuery(Task.find({
      assignedTo: memberObjectId,
      companyId: companyId,
      priority: 'urgent',
      status: { $nin: ['completed', 'cancelled'] }
    }).sort({ dueDate: 1 }).limit(5));

    // Get overdue tasks (limit 5)
    const overdueTasks = await populateTaskQuery(Task.find({
      assignedTo: memberObjectId,
      companyId: companyId,
      dueDate: { $lt: new Date() },
      status: { $nin: ['completed', 'cancelled', 'blocked'] }
    }).sort({ dueDate: 1 }).limit(5));

    // Get today's tasks
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const todayTasks = await populateTaskQuery(Task.find({
      assignedTo: memberObjectId,
      companyId: companyId,
      dueDate: {
        $gte: startOfToday,
        $lt: endOfToday
      },
      status: { $nin: ['completed', 'cancelled'] }
    }).sort({ dueDate: 1 }));

    // Get team information
    const managerUser = member.manager || null;
    const resolvedManagerId = managerUser?._id?.toString() || member.managerId || null;

    let teamInfo = null;
    if (resolvedManagerId) {
      const managerObjectId = mongoose.Types.ObjectId.isValid(resolvedManagerId)
        ? new mongoose.Types.ObjectId(resolvedManagerId)
        : null;
      const managerMatch = managerObjectId
        ? { $or: [{ manager: managerObjectId }, { managerId: resolvedManagerId }] }
        : { managerId: resolvedManagerId };

      // Get team members under same manager
      const teamMembers = await User.find({
        companyId: companyId,
        _id: { $ne: memberId },
        status: 'active',
        ...managerMatch
      }).select('firstName lastName email role position');

      teamInfo = {
        manager: managerUser ? {
          _id: managerUser._id,
          name: `${managerUser.firstName} ${managerUser.lastName}`,
          email: managerUser.email,
          role: managerUser.role
        } : null,
        teamSize: teamMembers.length + 1, // +1 for current member
        teamMembers: teamMembers.map(tm => ({
          _id: tm._id,
          name: `${tm.firstName} ${tm.lastName}`,
          email: tm.email,
          role: tm.role,
          position: tm.position
        }))
      };
    }

    // Performance metrics
    const overallCompletionRate = taskStats.completionRate;
    const todayProgressRate = taskStats.todayCompletionRate;

    // Enhanced performance status considering both overall and today's progress
    let performanceStatus = 'improving';
    if (overallCompletionRate >= 80 && todayProgressRate >= 70) {
      performanceStatus = 'excellent';
    } else if (overallCompletionRate >= 60 && todayProgressRate >= 50) {
      performanceStatus = 'good';
    } else if (overallCompletionRate >= 40 || todayProgressRate >= 30) {
      performanceStatus = 'improving';
    }

    const performance = {
      completionRate: overallCompletionRate,
      todayCompletionRate: todayProgressRate,
      todayDueCompletionRate: taskStats.todayDueCompletionRate,
      tasksCompletedToday: taskStats.tasksCompletedToday,
      status: performanceStatus
    };

    return res.json({
      success: true,
      data: {
        member: {
          id: member._id,
          name: `${member.firstName} ${member.lastName}`,
          email: member.email,
          role: member.role,
          position: member.position,
          department: member.department ? {
            _id: member.department._id,
            name: member.department.name,
            color: member.department.color
          } : null,
          manager: managerUser ? {
            _id: managerUser._id,
            name: `${managerUser.firstName} ${managerUser.lastName}`,
            email: managerUser.email,
            role: managerUser.role
          } : null
        },
        stats: {
          totalTasks: taskStats.total,
          completedTasks: taskStats.completed,
          pendingTasks: taskStats.pending,
          todayTasks: taskStats.today,
          overdueTasks: taskStats.overdue,
          urgentTasks: taskStats.urgent,
          recentTasks: taskStats.recent
        },
        tasks: {
          recent: recentTasks,
          urgent: urgentTasks,
          overdue: overdueTasks,
          today: todayTasks
        },
        team: teamInfo,
        performance: performance
      }
    });
  } catch (err) {
    console.error('Member dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// GET /api/members/tasks
// Get member's tasks with filters
router.get('/tasks', async (req, res) => {
  try {
    const memberId = req.user.id;
    const companyId = req.user.companyId;
    const { status, priority, page = 1, limit = 20, sort = 'dueDate' } = req.query;
    const memberObjectId = new mongoose.Types.ObjectId(memberId);

    const skip = (page - 1) * limit;
    const filter = {
      assignedTo: memberObjectId,
      companyId: companyId
    };

    // Add filters
    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    // Build sort object
    const sortOptions = {};
    if (sort === 'dueDate') {
      sortOptions.dueDate = 1;
    } else if (sort === 'priority') {
      sortOptions.priority = -1; // High priority first
    } else if (sort === 'createdAt') {
      sortOptions.createdAt = -1;
    }

    const tasks = await populateTaskQuery(Task.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .sort(sortOptions));

    const totalTasks = await Task.countDocuments(filter);

    res.json({
      success: true,
      data: {
        tasks,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalTasks / limit),
          totalTasks,
          hasNext: skip + tasks.length < totalTasks,
          hasPrev: page > 1
        }
      }
    });
  } catch (err) {
    console.error('Member tasks error:', err);
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

// GET /api/members/profile
// Get member profile information
router.get('/profile', async (req, res) => {
  try {
    const memberId = req.user.id;

    const member = await User.findById(memberId)
      .select('-password -resetPasswordToken -resetPasswordExpires -emailVerificationToken')
      .populate('department', 'name color description')
      .populate('manager', 'firstName lastName email role')
      .populate('companyId', 'name');

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    res.json({
      success: true,
      data: member
    });
  } catch (err) {
    console.error('Member profile error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// GET /api/members/team
// Get team information for member
router.get('/team', async (req, res) => {
  try {
    const memberId = req.user.id;
    const companyId = req.user.companyId;

    const member = await User.findById(memberId).populate('manager').populate('department');
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    let teamData = {
      manager: null,
      teamMembers: [],
      department: null
    };

    // Get manager info
    if (member.manager) {
      teamData.manager = {
        _id: member.manager._id,
        firstName: member.manager.firstName,
        lastName: member.manager.lastName,
        email: member.manager.email,
        role: member.manager.role,
        position: member.manager.position
      };
    }

    // Get department info
    if (member.department) {
      teamData.department = {
        _id: member.department._id,
        name: member.department.name,
        description: member.department.description,
        color: member.department.color
      };
    }

    // Get team members (under same manager)
    if (member.manager) {
      teamData.teamMembers = await User.find({
        manager: member.manager._id,
        companyId: companyId,
        status: 'active'
      })
      .select('firstName lastName email role position avatar')
      .sort({ firstName: 1 });
    }

    res.json({
      success: true,
      data: teamData
    });
  } catch (err) {
    console.error('Member team error:', err);
    res.status(500).json({ error: 'Failed to load team information' });
  }
});

// GET /api/members/stats
// Get member performance statistics
router.get('/stats', async (req, res) => {
  try {
    const memberId = req.user.id;
    const companyId = req.user.companyId;
    const { period = 30 } = req.query; // days

    const daysAgo = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000);
    const memberObjectId = new mongoose.Types.ObjectId(memberId);

    // Task completion statistics for period
    const periodTasks = await Task.find({
      assignedTo: memberObjectId,
      companyId: companyId,
      createdAt: { $gte: daysAgo }
    });

    const completedPeriodTasks = periodTasks.filter(task => task.status === 'completed').length;
    const pendingPeriodTasks = periodTasks.filter(task => ['assigned', 'in_progress'].includes(task.status)).length;

    // Average completion time
    const completedTasks = await Task.find({
      assignedTo: memberObjectId,
      companyId: companyId,
      status: 'completed',
      completedDate: { $exists: true },
      createdAt: { $gte: daysAgo }
    });

    let avgCompletionDays = 0;
    if (completedTasks.length > 0) {
      const totalDays = completedTasks.reduce((sum, task) => {
        const created = new Date(task.createdAt);
        const completed = new Date(task.completedDate);
        const diffTime = completed - created;
        return sum + (diffTime / (1000 * 60 * 60 * 24));
      }, 0);
      avgCompletionDays = Math.round(totalDays / completedTasks.length);
    }

    // Priority distribution
    const priorityStats = await Task.aggregate([
      {
        $match: {
          assignedTo: memberObjectId,
          companyId: companyId,
          createdAt: { $gte: daysAgo }
        }
      },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    // Status distribution
    const statusStats = await Task.aggregate([
      {
        $match: {
          assignedTo: memberObjectId,
          companyId: companyId,
          createdAt: { $gte: daysAgo }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period: parseInt(period),
        overview: {
          totalTasks: periodTasks.length,
          completedTasks: completedPeriodTasks,
          pendingTasks: pendingPeriodTasks,
          completionRate: periodTasks.length > 0 ? Math.round((completedPeriodTasks / periodTasks.length) * 100) : 0,
          avgCompletionDays
        },
        priorityDistribution: priorityStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        statusDistribution: statusStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {})
      }
    });
  } catch (err) {
    console.error('Member stats error:', err);
    res.status(500).json({ error: 'Failed to load statistics' });
  }
});


// POST /api/members/quick-actions/request-leave
// Quick action to request leave
router.post('/quick-actions/request-leave', async (req, res) => {
  try {
    const memberId = req.user.id;
    const { startDate, endDate, reason, leaveType = 'casual' } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    // Create leave request
    const leaveRequest = new Leave({
      userId: memberId,
      companyId: req.user.companyId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason: reason || '',
      leaveType,
      status: 'pending'
    });

    await leaveRequest.save();
    await leaveRequest.populate('userId', 'firstName lastName email');

    res.status(201).json({
      success: true,
      data: leaveRequest
    });
  } catch (err) {
    console.error('Request leave error:', err);
    res.status(500).json({ error: 'Failed to request leave' });
  }
});

// GET /api/members/quick-actions/upcoming-meetings
// Get upcoming meetings for the member
router.get('/quick-actions/upcoming-meetings', async (req, res) => {
  try {
    const memberId = req.user.id;
    const { limit = 5 } = req.query;

    const meetings = await Meeting.find({
      $or: [
        { organizerId: memberId },
        { attendees: memberId }
      ],
      startTime: { $gte: new Date() },
      status: 'scheduled'
    })
    .populate('organizerId', 'firstName lastName email')
    .populate('attendees', 'firstName lastName email')
    .sort({ startTime: 1 })
    .limit(parseInt(limit));

    res.json({
      success: true,
      data: meetings
    });
  } catch (err) {
    console.error('Get upcoming meetings error:', err);
    res.status(500).json({ error: 'Failed to get upcoming meetings' });
  }
});

// GET /api/members/quick-actions/recent-tasks
// Get recent tasks for quick view
router.get('/quick-actions/recent-tasks', async (req, res) => {
  try {
    const memberId = req.user.id;
    const { limit = 5 } = req.query;

    const tasks = await populateTaskQuery(Task.find({
      assignedTo: memberId,
      companyId: req.user.companyId,
      status: { $nin: ['completed', 'cancelled'] }
    }).sort({ createdAt: -1 }).limit(parseInt(limit)));

    res.json({
      success: true,
      data: tasks
    });
  } catch (err) {
    console.error('Get recent tasks error:', err);
    res.status(500).json({ error: 'Failed to get recent tasks' });
  }
});

// PUT /api/members/profile/details
// Update member profile details
router.put('/profile/details', [
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

    const memberId = req.user.id;
    const updateData = req.body;

    // Verify user is a member
    const member = await User.findById(memberId);
    if (!member || member.role !== 'member') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only members can update their profile'
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
      const newFirst = filteredUpdateData.firstName || member.firstName;
      const newLast = filteredUpdateData.lastName || member.lastName;
      filteredUpdateData.name = `${newFirst} ${newLast}`.trim();
    }

    const updatedMember = await User.findByIdAndUpdate(
      memberId,
      filteredUpdateData,
      { new: true, runValidators: true }
    )
    .select('-password -resetPasswordToken -resetPasswordExpires -emailVerificationToken')
    .populate('department', 'name color')
    .populate('companyId', 'name');

    if (!updatedMember) {
      return res.status(404).json({
        error: 'Member not found',
        message: 'Member does not exist'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile details updated successfully',
      data: updatedMember
    });

  } catch (error) {
    console.error('Update member profile details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile details',
      message: error.message || 'Internal server error'
    });
  }
});

// POST /api/members/profile/avatar
// Upload member avatar
router.post('/profile/avatar', upload.single('avatar'), async (req, res) => {
  // Set longer timeout for file uploads
  req.setTimeout(120000); // 2 minutes
  res.setTimeout(120000); // 2 minutes

  try {
    const memberId = req.user.id;

    // Verify user is a member
    const member = await User.findById(memberId);
    if (!member || member.role !== 'member') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only members can update their avatar'
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

    console.log('Uploading avatar for member:', memberId, 'file:', req.file.originalname);

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
      folder: 'member-avatars',
      public_id: `member-${memberId}-${Date.now()}`,
      timeout: 60000, // 60 second timeout
      transformation: [
        { width: 300, height: 300, crop: 'fill', gravity: 'auto' },
        { quality: 'auto', format: 'jpg' }
      ]
    };

    console.log('Starting Cloudinary upload with options:', uploadOptions);
    const result = await uploadBufferToCloudinary(req.file.buffer, uploadOptions);
    console.log('Member avatar upload successful:', result.secure_url || result.url);

    // Validate the result
    if (!result || !result.secure_url) {
      throw new Error('Cloudinary upload failed - no URL returned');
    }

    // Update member avatar in database
    member.avatar = result.secure_url || result.url;
    await member.save();

    res.json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: {
        avatar: member.avatar,
        member: {
          id: member._id,
          firstName: member.firstName,
          lastName: member.lastName,
          avatar: member.avatar
        }
      }
    });

  } catch (error) {
    console.error('Member avatar upload error:', error);

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
