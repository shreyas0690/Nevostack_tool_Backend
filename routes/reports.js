const express = require('express');
const mongoose = require('mongoose');
const { Leave, Task, Department, User, Company } = require('../models');
const { requireRole, requireCompanyAccess } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/reports
// @desc    Return available reports and categories for the dashboard
// @access  All authenticated users
router.get('/', async (req, res) => {
  try {
    console.log('📊 Reports dashboard request from user:', req.user?.email);

    const reportsData = {
      success: true,
      data: {
        availableReports: [
          {
            id: 'overview',
            name: 'Overview Report',
            description: 'Company-wide performance overview',
            category: 'analytics'
          },
          {
            id: 'tasks',
            name: 'Tasks Report',
            description: 'Task completion and productivity metrics',
            category: 'productivity'
          },
          {
            id: 'departments',
            name: 'Department Report',
            description: 'Department-wise performance analytics',
            category: 'analytics'
          },
          {
            id: 'users',
            name: 'User Performance Report',
            description: 'Employee productivity and engagement metrics',
            category: 'hr'
          },
          {
            id: 'leave',
            name: 'Leave Report',
            description: 'Leave requests and approvals',
            category: 'hr'
          }
        ],
        savedReports: [],
        categories: ['hr', 'productivity', 'analytics', 'financial']
      }
    };

    res.json(reportsData);
  } catch (error) {
    console.error('❌ Reports dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load reports data',
      details: error.message
    });
  }
});

// @route   POST /api/reports/generate
// @desc    Generate report data for the given category and period
// @access  Admin, Super Admin
router.post(
  '/generate',
  requireRole(['admin', 'super_admin']),
  requireCompanyAccess,
  async (req, res) => {
    try {
      const {
        reportType = 'monthly',
        reportCategory = 'overview',
        startDate,
        endDate,
        companyId: queryCompanyId
      } = req.body;

      console.log('📊 Report generation request received:', {
        reportType,
        reportCategory,
        startDate,
        endDate,
        companyId: queryCompanyId,
        user: req.user
          ? { id: req.user._id || req.user.id, role: req.user.role, companyId: req.user.companyId }
          : null
      });

      // Resolve the companyId to use for the query
      let companyId = null;
      if (req.user && req.user.role !== 'super_admin') {
        companyId = req.user.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : null;
      } else if (queryCompanyId) {
        companyId = new mongoose.Types.ObjectId(queryCompanyId);
      }

      console.log('🏢 Company ID resolved:', companyId);

      // Calculate date range
      let start;
      let end;
      if (startDate && endDate) {
        start = new Date(startDate);
        end = new Date(endDate);
      } else {
        const now = new Date();
        if (reportType === 'weekly') {
          start = new Date(now);
          start.setDate(now.getDate() - now.getDay());
          end = new Date(start);
          end.setDate(start.getDate() + 6);
        } else {
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        }
      }

      console.log('📅 Date range calculated:', {
        reportType,
        reportCategory,
        start,
        end,
        companyId
      });

      // Fetch company information (optional)
      let companyInfo = null;
      if (companyId) {
        try {
          companyInfo = await Company.findOne({ $or: [{ _id: companyId }, { _id: companyId.toString() }] })
            .select('name logo address phone email website description');
        } catch (companyError) {
          console.warn('⚠️ Could not fetch company info:', companyError.message);
        }
      }

      // Generate the requested report data
      let reportData = {};
      console.log('🔄 Calling report generation function for category:', reportCategory);

      switch (reportCategory) {
        case 'overview':
          reportData = await generateOverviewReport(companyId, start, end);
          break;
        case 'tasks':
          reportData = await generateTasksReport(companyId, start, end);
          break;
        case 'departments':
          reportData = await generateDepartmentsReport(companyId, start, end);
          break;
        case 'users':
          reportData = await generateUsersReport(companyId, start, end);
          break;
        case 'leave':
          reportData = await generateLeaveReport(companyId, start, end);
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid report category'
          });
      }

      console.log('📊 Report data generated for category:', reportCategory);
      console.log('📈 Report data keys:', Object.keys(reportData || {}));

      const responsePayload = {
        period: `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`,
        reportType,
        category: reportCategory,
        generatedAt: new Date().toISOString(),
        generatedBy: req.user?._id || req.user?.id,
        companyId: companyId ? companyId.toString() : undefined,
        company: companyInfo
          ? {
            name: companyInfo.name,
            logo: companyInfo.logo,
            address: companyInfo.address,
            phone: companyInfo.phone,
            email: companyInfo.email,
            website: companyInfo.website,
            description: companyInfo.description
          }
          : undefined,
        ...reportData
      };

      console.log('📤 Sending response for category:', reportCategory);
      console.log('📊 Response data keys:', Object.keys(responsePayload));
      console.log('✅ Report generation completed successfully');

      res.json({
        success: true,
        data: responsePayload
      });
    } catch (err) {
      console.error('❌ Report generation error:', err);
      console.error('❌ Error stack:', err.stack);
      res.status(500).json({
        success: false,
        message: 'Failed to generate report',
        details: err.message
      });
    }
  }
);

// Helper function to generate overview report
async function generateOverviewReport(cid, start, end) {
  const taskMatch = { createdAt: { $gte: start, $lte: end } };
  if (cid) taskMatch.$or = [{ companyId: cid }, { companyId: cid.toString() }];

  const totalTasks = await Task.countDocuments(taskMatch);
  const tasksByStatus = await Task.aggregate([
    { $match: taskMatch },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  const tasksByPriority = await Task.aggregate([
    { $match: taskMatch },
    { $group: { _id: '$priority', count: { $sum: 1 } } }
  ]);

  const tasksData = {
    total: totalTasks,
    completed: tasksByStatus.find(s => s._id === 'completed')?.count || 0,
    inProgress: tasksByStatus.find(s => s._id === 'in_progress')?.count || 0,
    assigned: tasksByStatus.find(s => s._id === 'assigned')?.count || 0,
    blocked: tasksByStatus.find(s => s._id === 'blocked')?.count || 0,
    byPriority: {
      urgent: tasksByPriority.find(p => p._id === 'urgent')?.count || 0,
      high: tasksByPriority.find(p => p._id === 'high')?.count || 0,
      medium: tasksByPriority.find(p => p._id === 'medium')?.count || 0,
      low: tasksByPriority.find(p => p._id === 'low')?.count || 0
    }
  };

  const departmentsData = await Department.aggregate([
    cid ? { $match: { companyId: cid } } : { $match: {} },
    {
      $lookup: {
        from: 'tasks',
        let: { deptId: '$_id' },
        pipeline: [
          { $match: taskMatch },
          {
            $match: {
              $expr: {
                $eq: [{ $toString: '$departmentId' }, { $toString: '$$deptId' }]
              }
            }
          }
        ],
        as: 'tasks'
      }
    },
    {
      $addFields: {
        totalTasks: { $size: '$tasks' },
        completedTasks: {
          $size: { $filter: { input: '$tasks', as: 't', cond: { $eq: ['$$t.status', 'completed'] } } }
        }
      }
    },
    {
      $lookup: {
        from: 'users',
        let: { deptId: '$_id' },
        pipeline: [
          cid
            ? {
              $match: {
                $and: [
                  { companyId: cid },
                  {
                    $expr: {
                      $eq: [{ $toString: '$departmentId' }, { $toString: '$$deptId' }]
                    }
                  }
                ]
              }
            }
            : {
              $match: {
                $expr: {
                  $eq: [{ $toString: '$departmentId' }, { $toString: '$$deptId' }]
                }
              }
            }
        ],
        as: 'users'
      }
    },
    { $addFields: { members: { $size: '$users' } } },
    {
      $project: {
        name: 1,
        totalTasks: 1,
        completedTasks: 1,
        members: 1,
        completionRate: {
          $cond: [
            { $eq: ['$totalTasks', 0] },
            0,
            { $multiply: [{ $divide: ['$completedTasks', '$totalTasks'] }, 100] }
          ]
        }
      }
    }
  ]);

  const usersData = await User.aggregate([
    cid ? { $match: { $or: [{ companyId: cid }, { companyId: cid.toString() }] } } : { $match: {} },
    {
      $lookup: {
        from: 'tasks',
        let: { userId: '$_id' },
        pipeline: [
          { $match: taskMatch },
          {
            $match: {
              $expr: {
                $cond: [
                  { $isArray: '$assignedTo' },
                  // If assignedTo is an array, check if userId is in it
                  {
                    $in: [
                      { $toString: '$$userId' },
                      { $map: { input: '$assignedTo', as: 'aid', in: { $toString: '$$aid' } } }
                    ]
                  },
                  // If assignedTo is a single ObjectId, compare directly
                  { $eq: [{ $toString: '$assignedTo' }, { $toString: '$$userId' }] }
                ]
              }
            }
          }
        ],
        as: 'tasks'
      }
    },
    {
      $addFields: {
        totalTasks: { $size: '$tasks' },
        completedTasks: {
          $size: { $filter: { input: '$tasks', as: 't', cond: { $eq: ['$$t.status', 'completed'] } } }
        }
      }
    },
    {
      $lookup: {
        from: 'departments',
        let: { deptId: '$departmentId' },
        pipeline: [
          { $match: { $expr: { $eq: [{ $toString: '$_id' }, { $toString: '$$deptId' }] } } }
        ],
        as: 'department'
      }
    },
    {
      $project: {
        name: { $concat: ['$firstName', ' ', '$lastName'] },
        email: 1,
        department: { $ifNull: [{ $arrayElemAt: ['$department.name', 0] }, 'No Department'] },
        totalTasks: 1,
        completedTasks: 1,
        completionRate: {
          $cond: [
            { $eq: ['$totalTasks', 0] },
            0,
            { $multiply: [{ $divide: ['$completedTasks', '$totalTasks'] }, 100] }
          ]
        }
      }
    }
  ]);

  const leaveMatch = { createdAt: { $gte: start, $lte: end } };
  if (cid) leaveMatch.$or = [{ companyId: cid }, { companyId: cid.toString() }];

  const totalLeaves = await Leave.countDocuments(leaveMatch);
  const leavesByStatus = await Leave.aggregate([
    { $match: leaveMatch },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  const leavesByType = await Leave.aggregate([
    { $match: leaveMatch },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]);

  const leaveData = {
    total: totalLeaves,
    approved: leavesByStatus.find(s => s._id === 'approved')?.count || 0,
    pending: leavesByStatus.find(s => s._id === 'pending')?.count || 0,
    rejected: leavesByStatus.find(s => s._id === 'rejected')?.count || 0,
    cancelled: leavesByStatus.find(s => s._id === 'cancelled')?.count || 0,
    byType: {
      annual: leavesByType.find(t => t._id === 'annual')?.count || 0,
      sick: leavesByType.find(t => t._id === 'sick')?.count || 0,
      compensatory: leavesByType.find(t => t._id === 'compensatory')?.count || 0,
      emergency: leavesByType.find(t => t._id === 'emergency')?.count || 0
    }
  };

  return {
    tasks: tasksData,
    departments: departmentsData,
    users: usersData,
    leave: leaveData
  };
}

// Helper function to generate tasks report
async function generateTasksReport(cid, start, end) {
  try {
    console.log('🔄 Generating tasks report for company:', cid);
    console.log('📅 Date range:', start, 'to', end);

    const match = { createdAt: { $gte: start, $lte: end } };
    if (cid) {
      match.companyId = cid;
    }

    console.log('🔍 Tasks match query:', JSON.stringify(match, null, 2));

    const totalTasks = await Task.countDocuments(match);
    console.log('📊 Total tasks found:', totalTasks);

    const tasksByStatus = await Task.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    console.log('📈 Tasks by status:', tasksByStatus);

    const tasksByPriority = await Task.aggregate([
      { $match: match },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);
    console.log('🎯 Tasks by priority:', tasksByPriority);

    const topPerformers = await Task.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$assignedTo',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
        }
      },
      { $sort: { completed: -1, total: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userId: '$_id',
          userName: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
          userEmail: '$user.email',
          totalTasks: '$total',
          completedTasks: '$completed',
          completionRate: {
            $cond: [
              { $eq: ['$total', 0] },
              0,
              { $multiply: [{ $divide: ['$completed', '$total'] }, 100] }
            ]
          }
        }
      }
    ]);

    console.log('🏆 Top performers count:', topPerformers.length);

    const result = {
      total: totalTasks,
      byStatus: {
        completed: tasksByStatus.find(s => s._id === 'completed')?.count || 0,
        inProgress: tasksByStatus.find(s => s._id === 'in_progress')?.count || 0,
        assigned: tasksByStatus.find(s => s._id === 'assigned')?.count || 0,
        blocked: tasksByStatus.find(s => s._id === 'blocked')?.count || 0
      },
      byPriority: {
        urgent: tasksByPriority.find(p => p._id === 'urgent')?.count || 0,
        high: tasksByPriority.find(p => p._id === 'high')?.count || 0,
        medium: tasksByPriority.find(p => p._id === 'medium')?.count || 0,
        low: tasksByPriority.find(p => p._id === 'low')?.count || 0
      },
      topPerformers
    };

    console.log('✅ Tasks report generated:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('❌ Error generating tasks report:', error);
    throw error;
  }
}

// Helper function to generate departments report
async function generateDepartmentsReport(cid, start, end) {
  try {
    console.log('🔄 Generating departments report for company:', cid);
    console.log('📅 Date range:', start, 'to', end);

    const taskMatch = { createdAt: { $gte: start, $lte: end } };
    if (cid) {
      taskMatch.companyId = cid;
    }

    const deptMatch = cid ? { companyId: cid } : {};
    console.log('🔍 Department match query:', JSON.stringify(deptMatch, null, 2));
    console.log('🔍 Task match query:', JSON.stringify(taskMatch, null, 2));

    const departments = await Department.aggregate([
      { $match: deptMatch },
      {
        $lookup: {
          from: 'tasks',
          let: { deptId: '$_id' },
          pipeline: [
            { $match: taskMatch },
            {
              $match: {
                $expr: {
                  $eq: [{ $toString: '$departmentId' }, { $toString: '$$deptId' }]
                }
              }
            }
          ],
          as: 'tasks'
        }
      },
      {
        $addFields: {
          totalTasks: { $size: '$tasks' },
          completedTasks: {
            $size: { $filter: { input: '$tasks', as: 't', cond: { $eq: ['$$t.status', 'completed'] } } }
          },
          inProgressTasks: {
            $size: { $filter: { input: '$tasks', as: 't', cond: { $eq: ['$$t.status', 'in_progress'] } } }
          },
          pendingTasks: {
            $size: {
              $filter: {
                input: '$tasks',
                as: 't',
                cond: { $in: ['$$t.status', ['assigned', 'blocked']] }
              }
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          let: { deptId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: [{ $toString: '$departmentId' }, { $toString: '$$deptId' }] } } },
            ...(cid ? [{ $match: { companyId: cid } }] : [])
          ],
          as: 'users'
        }
      },
      {
        $addFields: {
          members: { $size: '$users' },
          activeMembers: {
            $size: { $filter: { input: '$users', as: 'u', cond: { $eq: ['$$u.isActive', true] } } }
          }
        }
      },
      {
        $project: {
          name: 1,
          description: 1,
          totalTasks: 1,
          completedTasks: 1,
          inProgressTasks: 1,
          pendingTasks: 1,
          members: 1,
          activeMembers: 1,
          completionRate: {
            $cond: [
              { $eq: ['$totalTasks', 0] },
              0,
              { $multiply: [{ $divide: ['$completedTasks', '$totalTasks'] }, 100] }
            ]
          },
          productivity: {
            $cond: [
              { $eq: ['$members', 0] },
              0,
              { $multiply: [{ $divide: ['$completedTasks', '$members'] }, 100] }
            ]
          }
        }
      }
    ]);

    console.log('🏢 Departments found:', departments.length);

    const result = {
      departments,
      summary: {
        totalDepartments: departments.length,
        totalMembers: departments.reduce((sum, dept) => sum + dept.members, 0),
        totalTasks: departments.reduce((sum, dept) => sum + dept.totalTasks, 0),
        totalCompleted: departments.reduce((sum, dept) => sum + dept.completedTasks, 0),
        averageCompletionRate:
          departments.length > 0
            ? departments.reduce((sum, dept) => sum + dept.completionRate, 0) / departments.length
            : 0
      }
    };

    console.log('✅ Departments report generated:', JSON.stringify(result.summary, null, 2));
    return result;
  } catch (error) {
    console.error('❌ Error generating departments report:', error);
    throw error;
  }
}

// Helper function to generate users report
async function generateUsersReport(cid, start, end) {
  try {
    console.log('🔄 Generating users report for company:', cid);
    console.log('📅 Date range:', start, 'to', end);

    const taskMatch = { createdAt: { $gte: start, $lte: end } };
    if (cid) {
      taskMatch.companyId = cid;
    }

    const userMatch = cid ? { companyId: cid } : {};
    console.log('🔍 User match query:', JSON.stringify(userMatch, null, 2));
    console.log('🔍 Task match query:', JSON.stringify(taskMatch, null, 2));

    const users = await User.aggregate([
      { $match: userMatch },
      {
        $lookup: {
          from: 'tasks',
          let: { userId: '$_id' },
          pipeline: [
            { $match: taskMatch },
            {
              $match: {
                $expr: {
                  $cond: [
                    { $isArray: '$assignedTo' },
                    // If assignedTo is an array, check if userId is in it
                    {
                      $in: [
                        { $toString: '$$userId' },
                        { $map: { input: '$assignedTo', as: 'aid', in: { $toString: '$$aid' } } }
                      ]
                    },
                    // If assignedTo is a single ObjectId, compare directly
                    { $eq: [{ $toString: '$assignedTo' }, { $toString: '$$userId' }] }
                  ]
                }
              }
            }
          ],
          as: 'tasks'
        }
      },
      {
        $addFields: {
          totalTasks: { $size: '$tasks' },
          completedTasks: {
            $size: { $filter: { input: '$tasks', as: 't', cond: { $eq: ['$$t.status', 'completed'] } } }
          },
          inProgressTasks: {
            $size: { $filter: { input: '$tasks', as: 't', cond: { $eq: ['$$t.status', 'in_progress'] } } }
          },
          overdueTasks: {
            $size: {
              $filter: {
                input: '$tasks',
                as: 't',
                cond: {
                  $and: [
                    { $ne: ['$$t.status', 'completed'] },
                    { $lt: ['$$t.dueDate', new Date()] }
                  ]
                }
              }
            }
          }
        }
      },
      {
        $lookup: {
          from: 'departments',
          let: { deptId: '$departmentId' },
          pipeline: [
            { $match: { $expr: { $eq: [{ $toString: '$_id' }, { $toString: '$$deptId' }] } } }
          ],
          as: 'department'
        }
      },
      {
        $project: {
          userId: '$_id',
          name: { $concat: ['$firstName', ' ', '$lastName'] },
          email: 1,
          role: 1,
          isActive: 1,
          department: { $ifNull: [{ $arrayElemAt: ['$department.name', 0] }, 'No Department'] },
          totalTasks: 1,
          completedTasks: 1,
          inProgressTasks: 1,
          overdueTasks: 1,
          completionRate: {
            $cond: [
              { $eq: ['$totalTasks', 0] },
              0,
              { $multiply: [{ $divide: ['$completedTasks', '$totalTasks'] }, 100] }
            ]
          },
          lastLogin: 1
        }
      },
      { $sort: { completionRate: -1 } }
    ]);

    console.log('👥 Users found:', users.length);

    const result = {
      users,
      summary: {
        totalUsers: users.length,
        activeUsers: users.filter(u => u.isActive).length,
        totalTasks: users.reduce((sum, u) => sum + u.totalTasks, 0),
        totalCompleted: users.reduce((sum, u) => sum + u.completedTasks, 0),
        averageCompletionRate:
          users.length > 0 ? users.reduce((sum, u) => sum + u.completionRate, 0) / users.length : 0,
        usersWithTasks: users.filter(u => u.totalTasks > 0).length
      }
    };

    console.log('✅ Users report generated:', JSON.stringify(result.summary, null, 2));
    return result;
  } catch (error) {
    console.error('❌ Error generating users report:', error);
    throw error;
  }
}

// Helper function to generate leave report
async function generateLeaveReport(cid, start, end) {
  try {
    console.log('🔄 Generating leave report for company:', cid);
    console.log('📅 Date range:', start, 'to', end);

    const leaveMatch = { createdAt: { $gte: start, $lte: end } };
    if (cid) {
      leaveMatch.companyId = cid;
    }

    console.log('🔍 Leave match query:', JSON.stringify(leaveMatch, null, 2));

    const totalLeaves = await Leave.countDocuments(leaveMatch);
    console.log('📊 Total leaves found:', totalLeaves);

    const leavesByStatus = await Leave.aggregate([
      { $match: leaveMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    console.log('📈 Leaves by status:', leavesByStatus);

    const leavesByType = await Leave.aggregate([
      { $match: leaveMatch },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);
    console.log('🎯 Leaves by type:', leavesByType);

    const leavesByMonth = await Leave.aggregate([
      { $match: leaveMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$startDate' } },
          count: { $sum: 1 },
          totalDays: { $sum: '$days' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    console.log('📅 Leaves by month:', leavesByMonth);

    const topLeaveUsers = await Leave.aggregate([
      { $match: leaveMatch },
      { $group: { _id: '$userId', totalDays: { $sum: '$days' }, count: { $sum: 1 } } },
      { $sort: { totalDays: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'departments',
          let: { deptId: '$user.departmentId' },
          pipeline: [
            { $match: { $expr: { $eq: [{ $toString: '$_id' }, { $toString: '$$deptId' }] } } }
          ],
          as: 'department'
        }
      },
      {
        $project: {
          userId: '$_id',
          userName: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
          userEmail: '$user.email',
          department: { $ifNull: [{ $arrayElemAt: ['$department.name', 0] }, 'No Department'] },
          totalLeaveDays: '$totalDays',
          leaveRequests: '$count'
        }
      }
    ]);

    console.log('🏆 Top leave users count:', topLeaveUsers.length);

    const recentLeaves = await Leave.find(leaveMatch)
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(20)
      .select('type status startDate endDate days reason createdAt');

    console.log('📋 Recent leaves count:', recentLeaves.length);

    const totalDaysResult = await Leave.aggregate([
      { $match: leaveMatch },
      { $group: { _id: null, total: { $sum: '$days' } } }
    ]);
    const totalDays = totalDaysResult[0]?.total || 0;

    const result = {
      summary: {
        total: totalLeaves,
        approved: leavesByStatus.find(s => s._id === 'approved')?.count || 0,
        pending: leavesByStatus.find(s => s._id === 'pending')?.count || 0,
        rejected: leavesByStatus.find(s => s._id === 'rejected')?.count || 0,
        cancelled: leavesByStatus.find(s => s._id === 'cancelled')?.count || 0,
        totalDays
      },
      byType: {
        annual: leavesByType.find(t => t._id === 'annual')?.count || 0,
        sick: leavesByType.find(t => t._id === 'sick')?.count || 0,
        compensatory: leavesByType.find(t => t._id === 'compensatory')?.count || 0,
        emergency: leavesByType.find(t => t._id === 'emergency')?.count || 0
      },
      byMonth: leavesByMonth.map(item => ({
        date: item._id,
        count: item.count,
        totalDays: item.totalDays
      })),
      topUsers: topLeaveUsers,
      recentRequests: recentLeaves.map(leave => ({
        id: leave._id,
        type: leave.type,
        status: leave.status,
        startDate: leave.startDate.toISOString(),
        endDate: leave.endDate.toISOString(),
        days: leave.days,
        reason: leave.reason,
        createdAt: leave.createdAt.toISOString(),
        employee: leave.userId
          ? {
            id: leave.userId._id,
            name: `${leave.userId.firstName} ${leave.userId.lastName}`,
            email: leave.userId.email
          }
          : null
      }))
    };

    console.log('✅ Leave report generated:', JSON.stringify(result.summary, null, 2));
    return result;
  } catch (error) {
    console.error('❌ Error generating leave report:', error);
    throw error;
  }
}

module.exports = router;
