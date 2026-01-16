const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { Department, User } = require('../models');
const { requireRole, requireCompanyAccess } = require('../middleware/auth');

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
  // Skip rate limiting for Team Management specific endpoints
  skip: (req) => {
    return req.path.includes('/employees') ||
      req.path.includes('/analytics') ||
      req.path.includes('/hierarchy');
  }
});

// Team Management specific rate limiting - NO RATE LIMITING for team management
const teamManagementLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10000, // Very high limit - effectively no rate limiting
  message: {
    error: 'Too many team management requests.',
    retryAfter: 1
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply different rate limiters based on route
router.use((req, res, next) => {
  // Team Management routes get no rate limiting
  if (req.path.includes('/employees') ||
    req.path.includes('/analytics') ||
    req.path.includes('/hierarchy')) {
    return teamManagementLimiter(req, res, next);
  }
  // Other department routes get normal HOD panel rate limiting
  return hodPanelLimiter(req, res, next);
});

// @route   GET /api/departments
// @desc    Get all departments (with pagination and filters)
// @access  Private (Admin, Super Admin, HR, HR Manager)
router.get('/', requireRole(['admin', 'super_admin', 'hr', 'hr_manager']), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      companyId = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    // Build filter query
    const filter = {};

    // Company filter (for company admins and HR users)
    if (req.user.role === 'admin' || req.user.role === 'hr' || req.user.role === 'hr_manager') {
      filter.companyId = req.user.companyId;
    } else if (companyId) {
      filter.companyId = companyId;
    }

    // Search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Get departments with pagination
    const departments = await Department.find(filter)
      .populate('companyId', 'name domain')
      .populate('managerId', 'firstName lastName email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Department.countDocuments(filter);

    // Transform departments for response to match frontend expectations
    const transformedDepartments = departments.map(department => {
      // Combine managerId and assistantManagerIds into managerIds array
      const managerIdsList = [];
      if (department.managerId) {
        managerIdsList.push(department.managerId.toString());
      }
      if (department.managerIds && department.managerIds.length > 0) {
        managerIdsList.push(...department.managerIds.map(id => id.toString()));
      }

      return {
        id: department._id.toString(),
        name: department.name,
        description: department.description || '',
        headId: department.headId ? department.headId.toString() : undefined,
        managerIds: managerIdsList,
        memberIds: department.memberIds ? department.memberIds.map(id => id.toString()) : [],
        memberCount: department.employeeCount || department.memberIds?.length || 0,
        color: department.metadata?.color || '#3B82F6',
        companyId: department.companyId ? department.companyId.toString() : undefined,
        status: department.status,
        type: department.type,
        level: department.level,
        settings: department.settings,
        createdAt: department.createdAt,
        updatedAt: department.updatedAt
      };
    });

    res.status(200).json({
      success: true,
      data: transformedDepartments,
      departments: transformedDepartments, // Keep for backward compatibility
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({
      error: 'Failed to get departments',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/departments/:id
// @desc    Get department by ID
// @access  Private (Admin, Super Admin, or department member)
router.get('/:id', requireRole(['admin', 'super_admin', 'department_head', 'manager', 'member', 'person']), async (req, res) => {
  try {
    const departmentId = req.params.id;
    const requestingUser = req.user;

    const department = await Department.findById(departmentId)
      .populate('companyId', 'name domain')
      .populate('managerId', 'firstName lastName email avatar');

    if (!department) {
      return res.status(404).json({
        error: 'Department not found',
        message: 'Department does not exist'
      });
    }

    // Check if user can access this department
    if (requestingUser.role !== 'super_admin' &&
      requestingUser.role !== 'admin' &&
      requestingUser.departmentId?.toString() !== departmentId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own department'
      });
    }

    // For company admins, ensure department belongs to their company
    if (requestingUser.role === 'admin' &&
      department.companyId.toString() !== requestingUser.companyId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Department not found in your company'
      });
    }

    // Get department employees
    const employees = await User.find({ departmentId })
      .select('firstName lastName email role status avatar lastActive')
      .sort({ firstName: 1, lastName: 1 });

    // Transform single department response to match frontend expectations
    const singleDeptManagerIds = [];
    if (department.managerId) {
      singleDeptManagerIds.push(department.managerId.toString());
    }
    if (department.managerIds && department.managerIds.length > 0) {
      singleDeptManagerIds.push(...department.managerIds.map(id => id.toString()));
    }

    res.status(200).json({
      success: true,
      data: {
        id: department._id.toString(),
        name: department.name,
        description: department.description || '',
        headId: department.headId ? department.headId.toString() : undefined,
        managerIds: singleDeptManagerIds,
        memberIds: department.memberIds ? department.memberIds.map(id => id.toString()) : [],
        memberCount: department.employeeCount || department.memberIds?.length || 0,
        color: department.metadata?.color || '#3B82F6',
        companyId: department.companyId ? department.companyId.toString() : undefined,
        status: department.status,
        type: department.type,
        level: department.level,
        settings: department.settings,
        employees,
        createdAt: department.createdAt,
        updatedAt: department.updatedAt
      }
    });

  } catch (error) {
    console.error('Get department error:', error);
    res.status(500).json({
      error: 'Failed to get department',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/departments
// @desc    Create new department
// @access  Private (Admin, Super Admin, HR Manager)
router.post('/', [
  requireRole(['admin', 'super_admin', 'hr_manager']),
  body('name').notEmpty().withMessage('Department name is required'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('managerId').optional().isMongoId().withMessage('Invalid manager ID'),
  body('headId').optional().isMongoId().withMessage('Invalid head ID'),
  body('color').optional().isString().withMessage('Color must be a string'),
  body('status').optional().isIn(['active', 'inactive', 'archived']).withMessage('Invalid status')
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
      description,
      managerId,
      headId,
      managerIds = [],
      memberIds = [],
      memberCount = 0,
      color = '#3B82F6',
      status = 'active'
    } = req.body;

    // Get company ID
    const companyId = req.user.companyId;
    if (!companyId) {
      return res.status(400).json({
        error: 'Company ID required',
        message: 'Company information is missing'
      });
    }

    // Check if department name already exists in the company
    const existingDepartment = await Department.findOne({
      name,
      companyId
    });
    if (existingDepartment) {
      return res.status(400).json({
        error: 'Department already exists',
        message: 'A department with this name already exists in your company'
      });
    }

    // Validate manager if provided
    if (managerId) {
      const manager = await User.findById(managerId);
      if (!manager || manager.companyId.toString() !== companyId) {
        return res.status(400).json({
          error: 'Invalid manager',
          message: 'Manager not found in your company'
        });
      }
    }

    // Create department with proper field mapping
    const department = new Department({
      name,
      description,
      companyId,
      managerId,
      headId,
      managerIds: managerIds || [], // Frontend managerIds maps to managerIds
      memberIds: memberIds || [],
      employeeCount: memberCount || 0,
      metadata: {
        color: color || '#3B82F6'
      },
      status,
      type: 'main'
    });

    await department.save();

    // Populate company and manager
    await department.populate('companyId', 'name domain');
    await department.populate('managerId', 'firstName lastName email');

    // Transform create response to match frontend expectations
    const createResponseManagerIds = [];
    if (department.managerId) {
      createResponseManagerIds.push(department.managerId.toString());
    }
    if (department.assistantManagerIds && department.assistantManagerIds.length > 0) {
      createResponseManagerIds.push(...department.assistantManagerIds.map(id => id.toString()));
    }

    // Sync users for new department: promote head, managers, and set members' department
    const deptObjectId = department._id;
    const deptIdStr = deptObjectId.toString();

    const newManagerIds = [];
    if (department.managerId) newManagerIds.push(department.managerId.toString());
    if (department.managerIds && department.managerIds.length) newManagerIds.push(...department.managerIds.map(id => id.toString()));
    const uniqueNewManagerIds = [...new Set(newManagerIds)];

    // Promote head
    if (department.headId) {
      await User.updateOne(
        { _id: department.headId },
        { $set: { role: 'department_head', department: deptObjectId, departmentId: deptIdStr } }
      );
    }

    // Promote managers
    if (uniqueNewManagerIds.length) {
      await User.updateMany(
        { _id: { $in: uniqueNewManagerIds }, role: { $nin: ['super_admin', 'admin', 'hr_manager', 'hr'] } },
        { $set: { role: 'manager', department: deptObjectId, departmentId: deptIdStr, manager: department.managerId || null, managerId: department.managerId ? department.managerId.toString() : null } }
      );
    }

    // Set department for members
    if (department.memberIds && department.memberIds.length) {
      await User.updateMany(
        { _id: { $in: department.memberIds } },
        { $set: { department: deptObjectId, departmentId: deptIdStr } }
      );
    }

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: {
        id: department._id.toString(),
        name: department.name,
        description: department.description || '',
        headId: department.headId ? department.headId.toString() : undefined,
        managerIds: createResponseManagerIds,
        memberIds: department.memberIds ? department.memberIds.map(id => id.toString()) : [],
        memberCount: department.employeeCount || department.memberIds?.length || 0,
        color: department.metadata?.color || '#3B82F6',
        companyId: department.companyId ? department.companyId.toString() : undefined,
        status: department.status,
        type: department.type,
        settings: department.settings,
        createdAt: department.createdAt,
        updatedAt: department.updatedAt
      }
    });

  } catch (error) {
    console.error('Create department error:', error);
    res.status(500).json({
      error: 'Failed to create department',
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/departments/:id
// @desc    Update department and sync users (head/manager/member changes)
// @access  Private (Admin, Super Admin, HR Manager)
router.put('/:id', [
  requireRole(['admin', 'super_admin', 'hr_manager']),
  body('name').optional().isString().withMessage('Department name must be a string'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('managerId').optional().isMongoId().withMessage('Invalid manager ID'),
  body('headId').optional().isMongoId().withMessage('Invalid head ID'),
  body('managerIds').optional().isArray().withMessage('managerIds must be an array'),
  body('memberIds').optional().isArray().withMessage('memberIds must be an array'),
  body('status').optional().isIn(['active', 'inactive', 'archived']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', message: errors.array()[0].msg });
    }

    const departmentId = req.params.id;
    const requestingUser = req.user;

    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({ error: 'Department not found', message: 'Department does not exist' });
    }

    // For company admins and HR users, ensure department belongs to their company
    if ((requestingUser.role === 'admin' || requestingUser.role === 'hr' || requestingUser.role === 'hr_manager') &&
      department.companyId.toString() !== requestingUser.companyId) {
      return res.status(403).json({ error: 'Access denied', message: 'Department not found in your company' });
    }

    // Keep track of previous values to sync User roles
    const oldHeadId = department.headId ? department.headId.toString() : null;
    const oldManagerId = department.managerId ? department.managerId.toString() : null;
    const oldAssistantManagerIds = department.managerIds ? department.managerIds.map(id => id.toString()) : [];

    const {
      name,
      description,
      managerId,
      headId,
      managerIds = [],
      memberIds = [],
      status,
      color
    } = req.body;

    // Update department fields if provided
    if (name !== undefined) department.name = name;
    if (description !== undefined) department.description = description;
    if (managerId !== undefined) department.managerId = managerId || null;
    if (headId !== undefined) department.headId = headId || null;
    if (managerIds !== undefined) department.assistantManagerIds = managerIds || [];
    if (memberIds !== undefined) department.memberIds = memberIds || [];
    if (status !== undefined) department.status = status;
    if (color !== undefined) {
      department.metadata = department.metadata || {};
      department.metadata.color = color;
    }

    await department.save();

    // Sync users: promote/demote head and managers, set department on members
    const deptObjectId = department._id;
    const deptIdStr = deptObjectId.toString();

    // Build new manager ids list (manager + assistantManagerIds)
    const newManagerIds = [];
    if (department.managerId) newManagerIds.push(department.managerId.toString());
    if (department.assistantManagerIds && department.assistantManagerIds.length) newManagerIds.push(...department.assistantManagerIds.map(id => id.toString()));
    const uniqueNewManagerIds = [...new Set(newManagerIds)];

    // Demote old head if changed
    if (oldHeadId && oldHeadId !== (department.headId ? department.headId.toString() : null)) {
      await User.updateOne(
        { _id: oldHeadId, role: { $nin: ['super_admin', 'admin', 'hr_manager', 'hr'] } },
        { $set: { role: 'member' } }
      );
    }

    // Promote new head
    if (department.headId) {
      await User.updateOne(
        { _id: department.headId },
        { $set: { role: 'department_head', department: deptObjectId, departmentId: deptIdStr } }
      );
    }

    // Promote new managers (managerId + assistantManagerIds)
    if (uniqueNewManagerIds.length) {
      await User.updateMany(
        { _id: { $in: uniqueNewManagerIds }, role: { $nin: ['super_admin', 'admin', 'hr_manager', 'hr'] } },
        { $set: { role: 'manager', department: deptObjectId, departmentId: deptIdStr, manager: department.managerId || null, managerId: department.managerId ? department.managerId.toString() : null } }
      );
    }

    // Demote previous managers who are no longer managers
    const oldManagerIdsCombined = [];
    if (oldManagerId) oldManagerIdsCombined.push(oldManagerId);
    if (oldAssistantManagerIds && oldAssistantManagerIds.length) oldManagerIdsCombined.push(...oldAssistantManagerIds);
    const toDemote = oldManagerIdsCombined.filter(id => !uniqueNewManagerIds.includes(id) && id !== (department.headId ? department.headId.toString() : null));
    if (toDemote.length) {
      await User.updateMany(
        { _id: { $in: toDemote }, role: { $nin: ['super_admin', 'admin', 'hr_manager', 'hr'] } },
        { $set: { role: 'member' } }
      );
    }

    // Ensure members have department set
    if (department.memberIds && department.memberIds.length) {
      await User.updateMany(
        { _id: { $in: department.memberIds } },
        { $set: { department: deptObjectId, departmentId: deptIdStr } }
      );
    }

    // Transform response similar to create
    const responseManagerIds = [];
    if (department.managerId) responseManagerIds.push(department.managerId.toString());
    if (department.managerIds && department.managerIds.length) responseManagerIds.push(...department.managerIds.map(id => id.toString()));

    res.status(200).json({
      success: true,
      message: 'Department updated successfully',
      data: {
        id: department._id.toString(),
        name: department.name,
        description: department.description || '',
        headId: department.headId ? department.headId.toString() : undefined,
        managerIds: responseManagerIds,
        memberIds: department.memberIds ? department.memberIds.map(id => id.toString()) : [],
        memberCount: department.employeeCount || department.memberIds?.length || 0,
        color: department.metadata?.color || '#3B82F6',
        companyId: department.companyId ? department.companyId.toString() : undefined,
        status: department.status,
        type: department.type,
        settings: department.settings,
        createdAt: department.createdAt,
        updatedAt: department.updatedAt
      }
    });

  } catch (error) {
    console.error('Update department error:', error);
    res.status(500).json({ error: 'Failed to update department', message: 'Internal server error' });
  }
});

// @route   GET /api/departments/:id/employees
// @desc    Get department employees with hierarchy (for HOD)
// @access  Private (HOD, Admin, Super Admin)
router.get('/:id/employees', async (req, res) => {
  try {
    const departmentId = req.params.id;
    const {
      includeHierarchy = 'true',
      includePerformance = 'false'
    } = req.query;

    // Check if user has access to this department
    if (req.user.role === 'department_head') {
      // HOD can only access their own department
      if (req.user.departmentId !== departmentId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only access your own department data'
        });
      }
    } else if (req.user.role === 'admin') {
      // Admin can access departments in their company
      const department = await Department.findById(departmentId);
      if (!department || department.companyId.toString() !== req.user.companyId.toString()) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Department not found in your company'
        });
      }
    }
    // Super admin can access any department

    // Get department info
    const department = await Department.findById(departmentId)
      .populate('companyId', 'name domain');

    // Safely resolve companyId string whether populated or not
    const companyIdStr = department && department.companyId
      ? (department.companyId._id ? department.companyId._id.toString() : department.companyId.toString())
      : null;

    if (!department) {
      return res.status(404).json({
        error: 'Department not found',
        message: 'The requested department does not exist'
      });
    }

    // Get all department employees
    const employees = await User.find({
      $or: [
        { departmentId: departmentId },
        { department: departmentId }
      ]
    })
      .select('firstName lastName name email role status avatar phone lastActive managerId departmentId createdAt')
      .populate('managerId', 'firstName lastName email role')
      .sort({ role: 1, firstName: 1, lastName: 1 });

    // Transform employees data (guard against populated and non-populated managerId)
    const transformedEmployees = employees.map(emp => {
      // Resolve managerId whether populated (object) or raw ObjectId/string
      let resolvedManagerId = null;
      if (emp.managerId) {
        try {
          // If managerId is a populated document with _id
          if (emp.managerId._id) resolvedManagerId = emp.managerId._id.toString();
          else resolvedManagerId = emp.managerId.toString();
        } catch (e) {
          // Fallback
          resolvedManagerId = null;
        }
      }

      // Build manager summary only if populated with details
      let managerSummary = null;
      if (emp.managerId && emp.managerId.firstName) {
        managerSummary = {
          id: resolvedManagerId,
          name: `${emp.managerId.firstName} ${emp.managerId.lastName}`,
          email: emp.managerId.email,
          role: emp.managerId.role
        };
      }

      return {
        id: emp._id.toString(),
        name: emp.name || `${emp.firstName} ${emp.lastName}`,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email,
        role: emp.role,
        status: emp.status || 'active',
        isActive: emp.status === 'active',
        avatar: emp.avatar || '',
        phone: emp.phone || '',
        departmentId: emp.departmentId || emp.department,
        managerId: resolvedManagerId,
        manager: managerSummary,
        lastActive: emp.lastActive,
        joiningDate: emp.createdAt,
        createdAt: emp.createdAt,
        updatedAt: emp.updatedAt || emp.createdAt
      };
    });

    // If hierarchy is requested, organize by roles
    if (includeHierarchy === 'true') {
      const departmentHead = transformedEmployees.find(emp => emp.role === 'department_head');
      const managers = transformedEmployees.filter(emp => emp.role === 'manager');
      const members = transformedEmployees.filter(emp => emp.role === 'member');

      // Group members by their managers
      const managerTeams = managers.map(manager => ({
        manager,
        teamMembers: members.filter(member => member.managerId === manager.id)
      }));

      // Unassigned members (no manager)
      const unassignedMembers = members.filter(member => !member.managerId);

      return res.status(200).json({
        success: true,
        data: {
          department: {
            id: department._id.toString(),
            name: department.name,
            description: department.description,
            companyId: companyIdStr,
            company: department.companyId
          },
          hierarchy: {
            departmentHead,
            managers,
            members,
            managerTeams,
            unassignedMembers
          },
          allEmployees: transformedEmployees,
          stats: {
            totalEmployees: transformedEmployees.length,
            departmentHeads: departmentHead ? 1 : 0,
            managers: managers.length,
            members: members.length,
            activeEmployees: transformedEmployees.filter(emp => emp.isActive).length
          }
        }
      });
    }

    // Simple employee list
    res.status(200).json({
      success: true,
      data: {
        department: {
          id: department._id.toString(),
          name: department.name,
          description: department.description,
          companyId: companyIdStr,
          company: department.companyId
        },
        employees: transformedEmployees,
        stats: {
          totalEmployees: transformedEmployees.length,
          activeEmployees: transformedEmployees.filter(emp => emp.isActive).length
        }
      }
    });

  } catch (error) {
    console.error('Get department employees error:', error);
    res.status(500).json({
      error: 'Failed to get department employees',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/departments/:id/analytics
// @desc    Get department analytics (for HOD dashboard)
// @access  Private (HOD, Admin, Super Admin)
router.get('/:id/analytics', async (req, res) => {
  try {
    const departmentId = req.params.id;

    // Check access permissions (same as above)
    if (req.user.role === 'department_head') {
      if (req.user.departmentId !== departmentId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only access your own department analytics'
        });
      }
    }

    // Get department employees
    const employees = await User.find({
      $or: [
        { departmentId: departmentId },
        { department: departmentId }
      ]
    }).select('role status createdAt');

    // Get tasks for this department
    const { Task } = require('../models');
    const tasks = await Task.find({ departmentId })
      .select('status priority assignedTo createdAt completedDate')
      .populate('assignedTo', 'firstName lastName role');

    // Calculate analytics
    const analytics = {
      employeeStats: {
        total: employees.length,
        active: employees.filter(emp => emp.status === 'active').length,
        managers: employees.filter(emp => emp.role === 'manager').length,
        members: employees.filter(emp => emp.role === 'member').length,
        newThisMonth: employees.filter(emp => {
          const oneMonthAgo = new Date();
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
          return emp.createdAt > oneMonthAgo;
        }).length
      },
      taskStats: {
        total: tasks.length,
        completed: tasks.filter(task => task.status === 'completed').length,
        inProgress: tasks.filter(task => task.status === 'in_progress').length,
        pending: tasks.filter(task => task.status === 'assigned').length,
        overdue: tasks.filter(task => {
          const now = new Date();
          return task.status !== 'completed' && task.createdAt < new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        }).length,
        completionRate: tasks.length > 0 ? Math.round((tasks.filter(task => task.status === 'completed').length / tasks.length) * 100) : 0
      },
      performanceByRole: employees.reduce((acc, emp) => {
        const userTasks = tasks.filter(task => task.assignedTo && task.assignedTo._id.toString() === emp._id.toString());
        const completed = userTasks.filter(task => task.status === 'completed').length;
        const completionRate = userTasks.length > 0 ? Math.round((completed / userTasks.length) * 100) : 0;

        if (!acc[emp.role]) {
          acc[emp.role] = { totalTasks: 0, completedTasks: 0, employees: 0, averageCompletion: 0 };
        }

        acc[emp.role].totalTasks += userTasks.length;
        acc[emp.role].completedTasks += completed;
        acc[emp.role].employees += 1;
        acc[emp.role].averageCompletion = acc[emp.role].totalTasks > 0 ?
          Math.round((acc[emp.role].completedTasks / acc[emp.role].totalTasks) * 100) : 0;

        return acc;
      }, {})
    };

    res.status(200).json({
      success: true,
      data: analytics
    });

  } catch (error) {
    console.error('Get department analytics error:', error);
    res.status(500).json({
      error: 'Failed to get department analytics',
      message: 'Internal server error'
    });
  }
});

module.exports = router;
