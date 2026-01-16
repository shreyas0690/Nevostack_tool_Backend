const express = require('express');
const { body, validationResult } = require('express-validator');
const { Company, User, Department } = require('../models');
const { requireRole, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Test route to verify router is working
router.get('/test', (req, res) => {
  res.json({ message: 'Companies router is working!', timestamp: new Date().toISOString() });
});

// Get company features for current user's company
router.get('/features', authenticateToken, async (req, res) => {
  try {
    console.log('🏢 Company features route hit!');
    console.log('🏢 User:', req.user?.email);
    console.log('🏢 Company ID:', req.user?.companyId);
    
    if (!req.user?.companyId) {
      return res.status(400).json({
        success: false,
        message: 'User is not associated with any company'
      });
    }

    const company = await Company.findById(req.user.companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    // Get features from both settings.features and features fields
    const settingsFeatures = company.features || {};
    const companyFeatures = company.features || {};

    // Merge features with settings taking precedence
    const mergedFeatures = {
      attendance: settingsFeatures.attendance || companyFeatures.attendance || false,
      leaveManagement: settingsFeatures.leaveManagement || companyFeatures.leaveManagement || false,
      taskManagement: settingsFeatures.taskManagement || companyFeatures.taskManagement || false,
      reports: settingsFeatures.reports || companyFeatures.reports || false,
      analytics: companyFeatures.analytics || false,
      meetings: companyFeatures.meetings || false,
      apiAccess: companyFeatures.apiAccess || false,
      customBranding: companyFeatures.customBranding || false
    };

    console.log('✅ Company features retrieved:', mergedFeatures);

    // TEST: Set some features to true for testing
    // const testFeatures = {
    //   ...mergedFeatures,
    //   taskManagement: true,
    //   leaveManagement: true,
    //   attendance: false,
    //   analytics: true,
    //   reports: false,
    //   meetings: true,
    // };
    // console.log('🧪 TEST: Setting test features:', testFeatures);

    res.json({
      success: true,
      data: {
        features: mergedFeatures,
        company: {
          id: company._id,
          name: company.name,
          domain: company.domain
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching company features:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch company features',
      error: error.message
    });
  }
});

// @route   GET /api/companies
// @desc    Get all companies (with pagination and filters)
// @access  Private (Super Admin)
router.get('/', requireRole(['super_admin']), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      status = '',
      plan = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    // Build filter query
    const filter = {};

    // Search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { domain: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Plan filter
    if (plan) {
      filter.subscription = { plan };
    }

    // Get companies with pagination
    const companies = await Company.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Company.countDocuments(filter);

    // Transform companies for response
    const transformedCompanies = companies.map(company => ({
      id: company._id,
      name: company.name,
      domain: company.domain,
      email: company.email,
      phone: company.phone,
      address: company.address,
      logo: company.logo,
      status: company.status,
      subscription: company.subscription,
      settings: company.settings,
      stats: company.stats,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt
    }));

    res.status(200).json({
      success: true,
      companies: transformedCompanies,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({
      error: 'Failed to get companies',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/companies/:id
// @desc    Get company by ID
// @access  Private (Super Admin, or Company Admin)
router.get('/:id', async (req, res) => {
  try {
    const companyId = req.params.id;
    const requestingUser = req.user;

    // Check if user can access this company
    if (requestingUser.role !== 'super_admin' && 
        requestingUser.companyId?.toString() !== companyId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own company'
      });
    }

    const company = await Company.findById(companyId);

    if (!company) {
      return res.status(404).json({
        error: 'Company not found',
        message: 'Company does not exist'
      });
    }

    res.status(200).json({
      success: true,
      company: {
        id: company._id,
        name: company.name,
        domain: company.domain,
        email: company.email,
        phone: company.phone,
        address: company.address,
        logo: company.logo,
        status: company.status,
        subscription: company.subscription,
        settings: company.settings,
        stats: company.stats,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt
      }
    });

  } catch (error) {
    console.error('Get company error:', error);
    res.status(500).json({
      error: 'Failed to get company',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/companies
// @desc    Create new company
// @access  Private (Super Admin)
router.post('/', [
  requireRole(['super_admin']),
  body('name').notEmpty().withMessage('Company name is required'),
  body('domain').notEmpty().withMessage('Domain is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').optional().matches(/^[\+]?[1-9][\d]{0,15}$/).withMessage('Invalid phone number'),
  body('address').optional().isObject().withMessage('Address must be an object'),
  body('subscription.plan').optional().isIn(['basic', 'pro', 'enterprise']).withMessage('Invalid plan'),
  body('subscription.status').optional().isIn(['active', 'inactive', 'suspended', 'cancelled']).withMessage('Invalid subscription status'),
  body('status').optional().isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status')
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
      name,
      domain,
      email,
      phone,
      address,
      subscription = {},
      status = 'active',
      settings = {}
    } = req.body;

    // Check if domain already exists
    const existingCompany = await Company.findOne({ domain });
    if (existingCompany) {
      return res.status(400).json({
        error: 'Domain already exists',
        message: 'A company with this domain already exists'
      });
    }

    // Check if email already exists
    const existingEmail = await Company.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({
        error: 'Email already exists',
        message: 'A company with this email already exists'
      });
    }

    // Create company
    const company = new Company({
      name,
      domain,
      email,
      phone,
      address,
      status,
      subscription: {
        plan: subscription.plan || 'basic',
        status: subscription.status || 'active',
        startDate: subscription.startDate || new Date(),
        endDate: subscription.endDate,
        features: subscription.features || []
      },
      settings: {
        theme: settings.theme || 'default',
        timezone: settings.timezone || 'UTC',
        language: settings.language || 'en',
        notifications: settings.notifications || {
          email: true,
          push: true,
          sms: false
        }
      }
    });

    await company.save();

    res.status(201).json({
      success: true,
      message: 'Company created successfully',
      company: {
        id: company._id,
        name: company.name,
        domain: company.domain,
        email: company.email,
        phone: company.phone,
        address: company.address,
        status: company.status,
        subscription: company.subscription,
        createdAt: company.createdAt
      }
    });

  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json({
      error: 'Failed to create company',
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/companies/:id
// @desc    Update company
// @access  Private (Super Admin, or Company Admin)
router.put('/:id', [
  body('name').optional().notEmpty().withMessage('Company name cannot be empty'),
  body('domain').optional().notEmpty().withMessage('Domain cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('phone').optional().matches(/^[\+]?[1-9][\d]{0,15}$/).withMessage('Invalid phone number'),
  body('address').optional().isObject().withMessage('Address must be an object'),
  body('settings').optional().isObject().withMessage('Settings must be an object'),
  body('settings.timezone').optional().isString().withMessage('Timezone must be a string'),
  body('settings.language').optional().isString().withMessage('Language must be a string'),
  body('subscription.plan').optional().isIn(['basic', 'pro', 'enterprise']).withMessage('Invalid plan'),
  body('subscription.status').optional().isIn(['active', 'inactive', 'suspended', 'cancelled']).withMessage('Invalid subscription status'),
  body('status').optional().isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Company update validation errors:', errors.array());
      console.error('Request body:', req.body);
      return res.status(400).json({
        error: 'Validation failed',
        message: errors.array()[0].msg,
        details: errors.array()
      });
    }

    const companyId = req.params.id;
    const requestingUser = req.user;
    const updateData = req.body;

    // Check if user can update this company
    if (requestingUser.role !== 'super_admin' && 
        requestingUser.companyId?.toString() !== companyId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update your own company'
      });
    }

    // Check if domain already exists (if updating domain)
    if (updateData.domain) {
      const existingCompany = await Company.findOne({ 
        domain: updateData.domain, 
        _id: { $ne: companyId } 
      });
      if (existingCompany) {
        return res.status(400).json({
          error: 'Domain already exists',
          message: 'A company with this domain already exists'
        });
      }
    }

    // Check if email already exists (if updating email)
    if (updateData.email) {
      const existingCompany = await Company.findOne({ 
        email: updateData.email, 
        _id: { $ne: companyId } 
      });
      if (existingCompany) {
        return res.status(400).json({
          error: 'Email already exists',
          message: 'A company with this email already exists'
        });
      }
    }

    // Update company
    const company = await Company.findByIdAndUpdate(
      companyId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!company) {
      return res.status(404).json({
        error: 'Company not found',
        message: 'Company does not exist'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Company updated successfully',
      company: {
        id: company._id,
        name: company.name,
        domain: company.domain,
        email: company.email,
        phone: company.phone,
        address: company.address,
        logo: company.logo,
        status: company.status,
        subscription: company.subscription,
        settings: company.settings,
        updatedAt: company.updatedAt
      }
    });

  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json({
      error: 'Failed to update company',
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/companies/:id
// @desc    Delete company
// @access  Private (Super Admin)
router.delete('/:id', requireRole(['super_admin']), async (req, res) => {
  try {
    const companyId = req.params.id;

    // Check if company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        error: 'Company not found',
        message: 'Company does not exist'
      });
    }

    // Check if company has users
    const userCount = await User.countDocuments({ companyId });
    if (userCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete company',
        message: `Company has ${userCount} users. Please delete all users first.`
      });
    }

    // Delete company
    await Company.findByIdAndDelete(companyId);

    res.status(200).json({
      success: true,
      message: 'Company deleted successfully'
    });

  } catch (error) {
    console.error('Delete company error:', error);
    res.status(500).json({
      error: 'Failed to delete company',
      message: 'Internal server error'
    });
  }
});

// @route   PATCH /api/companies/:id/status
// @desc    Update company status
// @access  Private (Super Admin)
router.patch('/:id/status', [
  requireRole(['super_admin']),
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

    const companyId = req.params.id;
    const { status } = req.body;

    const company = await Company.findByIdAndUpdate(
      companyId,
      { status },
      { new: true }
    );

    if (!company) {
      return res.status(404).json({
        error: 'Company not found',
        message: 'Company does not exist'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Company status updated successfully',
      company: {
        id: company._id,
        name: company.name,
        domain: company.domain,
        status: company.status,
        updatedAt: company.updatedAt
      }
    });

  } catch (error) {
    console.error('Update company status error:', error);
    res.status(500).json({
      error: 'Failed to update company status',
      message: 'Internal server error'
    });
  }
});

// @route   PATCH /api/companies/:id/subscription
// @desc    Update company subscription
// @access  Private (Super Admin)
router.patch('/:id/subscription', [
  requireRole(['super_admin']),
  body('plan').optional().isIn(['basic', 'pro', 'enterprise']).withMessage('Invalid plan'),
  body('status').optional().isIn(['active', 'inactive', 'suspended', 'cancelled']).withMessage('Invalid subscription status'),
  body('startDate').optional().isISO8601().withMessage('Invalid start date'),
  body('endDate').optional().isISO8601().withMessage('Invalid end date'),
  body('features').optional().isArray().withMessage('Features must be an array')
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

    const companyId = req.params.id;
    const subscriptionData = req.body;

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        error: 'Company not found',
        message: 'Company does not exist'
      });
    }

    // Update subscription
    if (subscriptionData.plan) company.subscription.plan = subscriptionData.plan;
    if (subscriptionData.status) company.subscription.status = subscriptionData.status;
    if (subscriptionData.startDate) company.subscription.startDate = subscriptionData.startDate;
    if (subscriptionData.endDate) company.subscription.endDate = subscriptionData.endDate;
    if (subscriptionData.features) company.subscription.features = subscriptionData.features;

    await company.save();

    res.status(200).json({
      success: true,
      message: 'Company subscription updated successfully',
      subscription: company.subscription
    });

  } catch (error) {
    console.error('Update company subscription error:', error);
    res.status(500).json({
      error: 'Failed to update company subscription',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/companies/:id/users
// @desc    Get all users for a company
// @access  Private (Super Admin, or Company Admin)
router.get('/:id/users', async (req, res) => {
  try {
    const companyId = req.params.id;
    const requestingUser = req.user;

    // Check if user can access this company's users
    if (requestingUser.role !== 'super_admin' && 
        requestingUser.companyId?.toString() !== companyId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view users in your company'
      });
    }

    const {
      page = 1,
      limit = 20,
      search = '',
      role = '',
      status = ''
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build filter query
    const filter = { companyId };

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
      .populate('departmentId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-password -failedLoginAttempts -lockedUntil');

    // Get total count
    const total = await User.countDocuments(filter);

    // Transform users for response
    const transformedUsers = users.map(user => ({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      status: user.status,
      avatar: user.avatar,
      phone: user.phone,
      department: user.departmentId,
      lastLogin: user.lastLogin,
      lastActive: user.lastActive,
      createdAt: user.createdAt
    }));

    res.status(200).json({
      success: true,
      users: transformedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get company users error:', error);
    res.status(500).json({
      error: 'Failed to get company users',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/companies/stats
// @desc    Get company statistics
// @access  Private (Super Admin)
router.get('/stats', requireRole(['super_admin']), async (req, res) => {
  try {
    // Get company statistics
    const totalCompanies = await Company.countDocuments();
    const activeCompanies = await Company.countDocuments({ status: 'active' });
    const inactiveCompanies = await Company.countDocuments({ status: 'inactive' });
    const suspendedCompanies = await Company.countDocuments({ status: 'suspended' });

    // Get companies by subscription plan
    const companiesByPlan = await Company.aggregate([
      {
        $group: {
          _id: '$subscription.plan',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get companies by subscription status
    const companiesBySubscriptionStatus = await Company.aggregate([
      {
        $group: {
          _id: '$subscription.status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get recent companies (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentCompanies = await Company.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Get total users across all companies
    const totalUsers = await User.countDocuments();

    res.status(200).json({
      success: true,
      stats: {
        total: totalCompanies,
        active: activeCompanies,
        inactive: inactiveCompanies,
        suspended: suspendedCompanies,
        recent: recentCompanies,
        totalUsers,
        byPlan: companiesByPlan.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        bySubscriptionStatus: companiesBySubscriptionStatus.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      }
    });

  } catch (error) {
    console.error('Get company stats error:', error);
    res.status(500).json({
      error: 'Failed to get company statistics',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/companies/update-all-stats
// @desc    Update statistics for all companies
// @access  Private (Super Admin)
router.post('/update-all-stats', requireRole(['super_admin']), async (req, res) => {
  try {
    await Company.updateAllStats();
    
    res.status(200).json({
      success: true,
      message: 'All company statistics updated successfully'
    });
  } catch (error) {
    console.error('Update all company stats error:', error);
    res.status(500).json({
      error: 'Failed to update company statistics',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/companies/:id/stats
// @desc    Get individual company statistics
// @access  Private (Super Admin, or Company Admin)
router.get('/:id/stats', async (req, res) => {
  try {
    const companyId = req.params.id;
    const requestingUser = req.user;

    // Check if user can access this company's stats
    if (requestingUser.role !== 'super_admin' && 
        requestingUser.companyId?.toString() !== companyId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own company statistics'
      });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        error: 'Company not found',
        message: 'Company does not exist'
      });
    }

    // Update company stats before returning
    await company.updateStats();

    // Get detailed statistics
    const totalUsers = await User.countDocuments({ companyId });
    const activeUsers = await User.countDocuments({ 
      companyId, 
      status: 'active' 
    });
    const totalDepartments = await Department.countDocuments({ companyId });

    // Get users by role
    const usersByRole = await User.aggregate([
      { $match: { companyId: company._id } },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get departments by status
    const departmentsByStatus = await Department.aggregate([
      { $match: { companyId: company._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentUsers = await User.countDocuments({
      companyId,
      createdAt: { $gte: thirtyDaysAgo }
    });

    const recentDepartments = await Department.countDocuments({
      companyId,
      createdAt: { $gte: thirtyDaysAgo }
    });

    res.status(200).json({
      success: true,
      stats: {
        company: {
          id: company._id,
          name: company.name,
          domain: company.domain,
          status: company.status,
          subscription: company.subscription
        },
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers,
          recent: recentUsers,
          byRole: usersByRole.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {})
        },
        departments: {
          total: totalDepartments,
          recent: recentDepartments,
          byStatus: departmentsByStatus.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {})
        },
        lastUpdated: company.stats.lastActivity
      }
    });

  } catch (error) {
    console.error('Get company stats error:', error);
    res.status(500).json({
      error: 'Failed to get company statistics',
      message: 'Internal server error'
    });
  }
});

module.exports = router;











