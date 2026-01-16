const express = require('express');
const { body, validationResult } = require('express-validator');
const { Workspace, Company, User } = require('../models');
const { requireRole, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/workspaces
// @desc    Get all workspaces (Super Admin only)
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
        { subdomain: { $regex: search, $options: 'i' } },
        { domain: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Plan filter
    if (plan) {
      filter.plan = plan;
    }

    // Get workspaces with pagination
    const workspaces = await Workspace.find(filter)
      .populate('companyId', 'name email')
      .populate('ownerId', 'firstName lastName email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Workspace.countDocuments(filter);

    res.status(200).json({
      success: true,
      workspaces,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get workspaces error:', error);
    res.status(500).json({
      error: 'Failed to get workspaces',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/workspaces/current
// @desc    Get current user's workspace
// @access  Private
router.get('/current', authenticateToken, async (req, res) => {
  try {
    const requestingUser = req.user;

    if (!requestingUser.companyId) {
      return res.status(404).json({
        error: 'No workspace found',
        message: 'User is not associated with any company'
      });
    }

    const workspace = await Workspace.findOne({ companyId: requestingUser.companyId })
      .populate('companyId', 'name email phone address')
      .populate('ownerId', 'firstName lastName email');

    if (!workspace) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'No workspace found for this company'
      });
    }

    res.status(200).json({
      success: true,
      workspace
    });

  } catch (error) {
    console.error('Get current workspace error:', error);
    res.status(500).json({
      error: 'Failed to get current workspace',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/workspaces/stats
// @desc    Get workspace statistics (Super Admin only)
// @access  Private (Super Admin)
router.get('/stats', requireRole(['super_admin']), async (req, res) => {
  try {
    const totalWorkspaces = await Workspace.countDocuments();
    const activeWorkspaces = await Workspace.countDocuments({ status: 'active' });
    const trialWorkspaces = await Workspace.countDocuments({ status: 'trial' });
    
    // Get total users across all workspaces
    const totalUsers = await User.countDocuments({ status: 'active' });
    
    // Calculate average users per workspace
    const averageUsersPerWorkspace = totalWorkspaces > 0 ? Math.round(totalUsers / totalWorkspaces) : 0;
    
    // Calculate total revenue (simplified)
    const totalRevenue = 0; // This would be calculated from actual billing data

    res.status(200).json({
      success: true,
      stats: {
        totalWorkspaces,
        activeWorkspaces,
        trialWorkspaces,
        totalUsers,
        totalRevenue,
        averageUsersPerWorkspace
      }
    });

  } catch (error) {
    console.error('Get workspace stats error:', error);
    res.status(500).json({
      error: 'Failed to get workspace stats',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/workspaces/:id
// @desc    Get workspace by ID
// @access  Private (Workspace Owner or Super Admin)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const requestingUser = req.user;

    const workspace = await Workspace.findById(workspaceId)
      .populate('companyId', 'name email phone address')
      .populate('ownerId', 'firstName lastName email');

    if (!workspace) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace does not exist'
      });
    }

    // Check if user can access this workspace
    if (requestingUser.role !== 'super_admin' && 
        workspace.ownerId._id.toString() !== requestingUser.id &&
        workspace.companyId._id.toString() !== requestingUser.companyId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own workspace'
      });
    }

    res.status(200).json({
      success: true,
      workspace
    });

  } catch (error) {
    console.error('Get workspace error:', error);
    res.status(500).json({
      error: 'Failed to get workspace',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/workspaces
// @desc    Create new workspace
// @access  Private (Company Admin)
router.post('/', [
  authenticateToken,
  body('name').notEmpty().withMessage('Workspace name is required'),
  body('subdomain').notEmpty().withMessage('Subdomain is required'),
  body('plan').optional().isIn(['starter', 'professional', 'enterprise']).withMessage('Invalid plan')
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
      subdomain,
      plan = 'starter'
    } = req.body;

    const requestingUser = req.user;

    // Check if user has a company
    if (!requestingUser.companyId) {
      return res.status(400).json({
        error: 'No company found',
        message: 'You must be associated with a company to create a workspace'
      });
    }

    // Check if subdomain already exists
    const existingWorkspace = await Workspace.findBySubdomain(subdomain);
    if (existingWorkspace) {
      return res.status(400).json({
        error: 'Subdomain already exists',
        message: 'A workspace with this subdomain already exists'
      });
    }

    // Generate domain
    const domain = `${subdomain}.nevostack.com`;

    // Create workspace
    const workspace = await Workspace.createWorkspace({
      name,
      subdomain,
      domain,
      companyId: requestingUser.companyId,
      ownerId: requestingUser.id,
      plan,
      status: 'trial'
    });

    res.status(201).json({
      success: true,
      message: 'Workspace created successfully',
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

  } catch (error) {
    console.error('Create workspace error:', error);
    res.status(500).json({
      error: 'Failed to create workspace',
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/workspaces/:id
// @desc    Update workspace
// @access  Private (Workspace Owner or Super Admin)
router.put('/:id', [
  authenticateToken,
  body('name').optional().notEmpty().withMessage('Workspace name cannot be empty'),
  body('plan').optional().isIn(['starter', 'professional', 'enterprise']).withMessage('Invalid plan'),
  body('status').optional().isIn(['active', 'inactive', 'suspended', 'trial']).withMessage('Invalid status')
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

    const workspaceId = req.params.id;
    const requestingUser = req.user;
    const updateData = req.body;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace does not exist'
      });
    }

    // Check if user can update this workspace
    if (requestingUser.role !== 'super_admin' && 
        workspace.ownerId.toString() !== requestingUser.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update your own workspace'
      });
    }

    // Update workspace
    Object.assign(workspace, updateData);
    await workspace.save();

    res.status(200).json({
      success: true,
      message: 'Workspace updated successfully',
      workspace
    });

  } catch (error) {
    console.error('Update workspace error:', error);
    res.status(500).json({
      error: 'Failed to update workspace',
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/workspaces/:id
// @desc    Delete workspace
// @access  Private (Super Admin)
router.delete('/:id', requireRole(['super_admin']), async (req, res) => {
  try {
    const workspaceId = req.params.id;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace does not exist'
      });
    }

    // Delete workspace
    await Workspace.findByIdAndDelete(workspaceId);

    res.status(200).json({
      success: true,
      message: 'Workspace deleted successfully'
    });

  } catch (error) {
    console.error('Delete workspace error:', error);
    res.status(500).json({
      error: 'Failed to delete workspace',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/workspaces/:id/upgrade
// @desc    Upgrade workspace plan
// @access  Private (Workspace Owner)
router.post('/:id/upgrade', [
  authenticateToken,
  body('plan').isIn(['starter', 'professional', 'enterprise']).withMessage('Invalid plan'),
  body('billingInterval').optional().isIn(['monthly', 'yearly']).withMessage('Invalid billing interval')
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

    const workspaceId = req.params.id;
    const { plan, billingInterval = 'monthly' } = req.body;
    const requestingUser = req.user;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace does not exist'
      });
    }

    // Check if user can upgrade this workspace
    if (workspace.ownerId.toString() !== requestingUser.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only upgrade your own workspace'
      });
    }

    // Update plan and billing
    workspace.plan = plan;
    workspace.status = 'active';
    workspace.billing.interval = billingInterval;
    workspace.subscriptionStartDate = new Date();
    
    // Set subscription end date (1 month or 1 year from now)
    const endDate = new Date();
    if (billingInterval === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }
    workspace.subscriptionEndDate = endDate;

    // Update limits based on plan
    const planLimits = {
      starter: { maxUsers: 10, maxStorage: 1024, maxDepartments: 5 },
      professional: { maxUsers: 50, maxStorage: 5120, maxDepartments: 20 },
      enterprise: { maxUsers: 200, maxStorage: 20480, maxDepartments: 100 }
    };
    
    workspace.limits = { ...workspace.limits, ...planLimits[plan] };
    
    await workspace.save();

    res.status(200).json({
      success: true,
      message: 'Workspace upgraded successfully',
      workspace: {
        id: workspace._id,
        plan: workspace.plan,
        status: workspace.status,
        subscriptionStartDate: workspace.subscriptionStartDate,
        subscriptionEndDate: workspace.subscriptionEndDate,
        limits: workspace.limits
      }
    });

  } catch (error) {
    console.error('Upgrade workspace error:', error);
    res.status(500).json({
      error: 'Failed to upgrade workspace',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/workspaces/:id/usage
// @desc    Update workspace usage
// @access  Private (Workspace Owner or Super Admin)
router.post('/:id/usage', authenticateToken, async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const requestingUser = req.user;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace does not exist'
      });
    }

    // Check if user can update this workspace
    if (requestingUser.role !== 'super_admin' && 
        workspace.ownerId.toString() !== requestingUser.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update your own workspace'
      });
    }

    // Update usage
    await workspace.updateUsage();

    res.status(200).json({
      success: true,
      message: 'Workspace usage updated successfully',
      usage: workspace.usage
    });

  } catch (error) {
    console.error('Update workspace usage error:', error);
    res.status(500).json({
      error: 'Failed to update workspace usage',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/workspaces/:id/billing
// @desc    Get workspace billing history
// @access  Private (Workspace Owner or Super Admin)
router.get('/:id/billing', authenticateToken, async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const requestingUser = req.user;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace does not exist'
      });
    }

    // Check if user can access this workspace
    if (requestingUser.role !== 'super_admin' && 
        workspace.ownerId.toString() !== requestingUser.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own workspace'
      });
    }

    // Return billing information
    res.status(200).json({
      success: true,
      billing: {
        plan: workspace.plan,
        status: workspace.status,
        interval: workspace.billing.interval,
        amount: workspace.billing.amount,
        currency: workspace.billing.currency,
        nextBillingDate: workspace.billing.nextBillingDate,
        subscriptionStartDate: workspace.subscriptionStartDate,
        subscriptionEndDate: workspace.subscriptionEndDate,
        history: workspace.billing.billingHistory || []
      }
    });

  } catch (error) {
    console.error('Get workspace billing error:', error);
    res.status(500).json({
      error: 'Failed to get workspace billing',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/workspaces/:id/integrations
// @desc    Get workspace integrations
// @access  Private (Workspace Owner or Super Admin)
router.get('/:id/integrations', authenticateToken, async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const requestingUser = req.user;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace does not exist'
      });
    }

    // Check if user can access this workspace
    if (requestingUser.role !== 'super_admin' && 
        workspace.ownerId.toString() !== requestingUser.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own workspace'
      });
    }

    res.status(200).json({
      success: true,
      integrations: workspace.integrations || []
    });

  } catch (error) {
    console.error('Get workspace integrations error:', error);
    res.status(500).json({
      error: 'Failed to get workspace integrations',
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/workspaces/:id/integrations/:integrationId
// @desc    Update workspace integration
// @access  Private (Workspace Owner or Super Admin)
router.put('/:id/integrations/:integrationId', [
  authenticateToken,
  body('config').isObject().withMessage('Integration config must be an object'),
  body('enabled').optional().isBoolean().withMessage('Enabled must be a boolean')
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

    const workspaceId = req.params.id;
    const integrationId = req.params.integrationId;
    const requestingUser = req.user;
    const { config, enabled } = req.body;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace does not exist'
      });
    }

    // Check if user can update this workspace
    if (requestingUser.role !== 'super_admin' && 
        workspace.ownerId.toString() !== requestingUser.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update your own workspace'
      });
    }

    // Find and update integration
    const integration = workspace.integrations.id(integrationId);
    if (!integration) {
      return res.status(404).json({
        error: 'Integration not found',
        message: 'Integration does not exist'
      });
    }

    if (config) integration.config = config;
    if (enabled !== undefined) integration.enabled = enabled;

    await workspace.save();

    res.status(200).json({
      success: true,
      message: 'Integration updated successfully',
      integration
    });

  } catch (error) {
    console.error('Update workspace integration error:', error);
    res.status(500).json({
      error: 'Failed to update workspace integration',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/workspaces/subdomain/:subdomain
// @desc    Get workspace by subdomain
// @access  Public
router.get('/subdomain/:subdomain', async (req, res) => {
  try {
    const subdomain = req.params.subdomain;

    const workspace = await Workspace.findBySubdomain(subdomain)
      .populate('companyId', 'name logo')
      .select('name subdomain domain status plan customization settings trialEndsAt createdAt billing limits');

    if (!workspace) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'No workspace found with this subdomain'
      });
    }

    if (workspace.status !== 'active' && workspace.status !== 'trial') {
      return res.status(403).json({
        error: 'Workspace unavailable',
        message: 'This workspace is currently unavailable'
      });
    }

    res.status(200).json({
      success: true,
      workspace: {
        ...workspace.toObject(),
        trialEndsAt: workspace.trialEndsAt // Ensure trialEndsAt is included
      }
    });

  } catch (error) {
    console.error('Get workspace by subdomain error:', error);
    res.status(500).json({
      error: 'Failed to get workspace',
      message: 'Internal server error'
    });
  }
});

module.exports = router;
