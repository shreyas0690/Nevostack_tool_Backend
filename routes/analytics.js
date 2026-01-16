const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const { Leave, Task, Department, User } = require('../models');
const { requireRole, requireCompanyAccess } = require('../middleware/auth');

const router = express.Router();

// Analytics-specific rate limiting - More lenient for dashboard usage
const analyticsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 300, // Allow 300 requests per 5 minutes for analytics
  message: {
    error: 'Too many analytics requests, please wait a moment.',
    retryAfter: 5
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for Team Management specific endpoints
  skip: (req) => {
    return req.path.includes('/hod/team/overview');
  }
});

// Team Management analytics rate limiting - NO RATE LIMITING for team management
const teamManagementAnalyticsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10000, // Very high limit - effectively no rate limiting
  message: {
    error: 'Too many team management analytics requests.',
    retryAfter: 1
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply different rate limiters based on route
router.use((req, res, next) => {
  // Team Management analytics routes get no rate limiting
  if (req.path.includes('/hod/team/overview')) {
    return teamManagementAnalyticsLimiter(req, res, next);
  }
  // Other analytics routes get normal rate limiting
  return analyticsLimiter(req, res, next);
});

// @route GET /api/analytics/overview
// @desc  Overview KPIs
// @access Admin, HR, HR Manager
router.get('/overview', requireRole(['admin', 'super_admin', 'hr', 'hr_manager']), requireCompanyAccess, async (req, res) => {
  try {
    const { companyId: queryCompanyId, startDate, endDate } = req.query;
    // Prefer companyId from authenticated user for non-super-admins
    let cid = null;
    if (req.user && req.user.role !== 'super_admin') {
      cid = req.user.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : null;
    } else if (queryCompanyId) {
      cid = new mongoose.Types.ObjectId(queryCompanyId);
    }
    const start = startDate ? new Date(startDate) : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
    const end = endDate ? new Date(endDate) : new Date();

    const match = { startDate: { $gte: start, $lte: end } };
    // support companyId stored as ObjectId or string
    if (cid) match.$or = [{ companyId: cid }, { companyId: cid.toString() }];

    // Tasks summary
    const taskMatch = {};
    if (cid) taskMatch.$or = [{ companyId: cid }, { companyId: cid.toString() }];
    const totalTasks = await Task.countDocuments(taskMatch);
    const tasksByStatusAgg = await Task.aggregate([
      { $match: taskMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const tasksByStatus = {};
    (tasksByStatusAgg || []).forEach(s => tasksByStatus[s._id] = s.count);
    // Tasks by priority
    const tasksByPriorityAgg = await Task.aggregate([
      { $match: taskMatch },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);
    const tasksByPriority = {};
    (tasksByPriorityAgg || []).forEach(p => tasksByPriority[p._id] = p.count);
    // Top performers: users with most completed tasks in period
    const topPerformersPipeline = [
      { $match: taskMatch },
      { $group: { _id: '$assignedTo', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } },
      { $sort: { completed: -1, total: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      // lookup department name from user's departmentId
      { $lookup: { from: 'departments', let: { deptId: '$user.departmentId' }, pipeline: [{ $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$deptId'] } } }, { $project: { name: 1 } }], as: 'dept' } },
      { $addFields: { departmentName: { $ifNull: [{ $arrayElemAt: ['$dept.name', 0] }, '$user.departmentName', null] } } },
      { $project: { user: { _id: '$user._id', firstName: '$user.firstName', lastName: '$user.lastName', name: { $concat: ['$user.firstName', ' ', '$user.lastName'] }, email: '$user.email', departmentId: '$user.departmentId' }, total: 1, completed: 1, completionRate: { $cond: [{ $eq: ['$total', 0] }, 0, { $multiply: [{ $divide: ['$completed', '$total'] }, 100] }] }, departmentName: 1 } }
    ];
    const topPerformers = await Task.aggregate(topPerformersPipeline);
    // Log sample of top performers for debugging missing department names
    try {
      console.log('TopPerformers sample:', topPerformers.slice(0, 10).map(p => ({ userId: p.user?._id, userDeptId: p.user?.departmentId, departmentName: p.departmentName })));
    } catch (e) {
      console.warn('TopPerformers logging failed:', e && e.message);
    }
    // Also ensure departmentName strings are simple strings (not ObjectId wrappers)
    topPerformers.forEach(tp => {
      if (tp.departmentName && tp.departmentName._bsontype === 'ObjectID') {
        tp.departmentName = tp.departmentName.toString();
      }
    });
    // Tasks by department: include all departments, show 0 for those without tasks
    const deptMatch = cid ? { companyId: cid } : {};
    const lookupPipeline = [];
    // match tasks for the department via deptId
    lookupPipeline.push({ $match: { $expr: { $eq: [{ $toString: '$departmentId' }, { $toString: '$$deptId' }] } } });
    if (cid) lookupPipeline.push({ $match: { companyId: cid } });

    const deptPipeline = [
      { $match: deptMatch },
      {
        $lookup: {
          from: 'tasks',
          let: { deptId: '$_id' },
          pipeline: lookupPipeline,
          as: 'tasks'
        }
      },
      { $addFields: { total: { $size: '$tasks' }, completed: { $size: { $filter: { input: '$tasks', as: 't', cond: { $eq: ['$$t.status', 'completed'] } } } } } },
      { $lookup: { from: 'users', let: { deptId: '$_id' }, pipeline: [{ $match: { $expr: { $eq: [{ $toString: '$departmentId' }, { $toString: '$$deptId' }] } } }, { $count: 'count' }], as: 'usersCount' } },
      { $addFields: { members: { $ifNull: [{ $arrayElemAt: ['$usersCount.count', 0] }, 0] } } },
      { $project: { departmentId: '$_id', name: '$name', total: 1, completed: 1, members: 1, completionRate: { $cond: [{ $eq: ['$total', 0] }, 0, { $multiply: [{ $divide: ['$completed', '$total'] }, 100] }] } } }
    ];

    const byDepartment = await Department.aggregate(deptPipeline);

    // Leaves: Use a simpler query approach - match by createdAt within date range
    // This ensures we capture recently created leave requests
    const leaveMatch = { createdAt: { $gte: start, $lte: end } };
    if (cid) {
      leaveMatch.companyId = cid;
    }

    // Debug: Log some sample leaves to understand the data
    console.log('Analytics Overview - Date range:', { start, end });
    console.log('Analytics Overview - Company ID:', cid);
    const sampleLeaves = await Leave.find(leaveMatch).limit(5).select('status startDate createdAt companyId');
    console.log('Analytics Overview - Sample leaves found:', sampleLeaves.length);
    console.log('Analytics Overview - Sample leave data:', sampleLeaves.map(l => ({
      status: l.status,
      startDate: l.startDate,
      createdAt: l.createdAt,
      companyId: l.companyId
    })));

    const totalLeaves = await Leave.countDocuments(leaveMatch);
    const leavesByStatus = await Leave.aggregate([
      { $match: leaveMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const byStatus = {};
    (leavesByStatus || []).forEach(s => byStatus[s._id] = s.count);

    // Ensure all status types are present with default 0 values
    const defaultStatuses = ['pending', 'approved', 'rejected', 'cancelled'];
    defaultStatuses.forEach(status => {
      if (!(status in byStatus)) {
        byStatus[status] = 0;
      }
    });

    console.log('Analytics Overview - Raw aggregation result:', leavesByStatus);
    console.log('Analytics Overview - Processed byStatus:', byStatus);
    console.log('Analytics Overview - Pending count:', byStatus.pending || 0);
    console.log('Analytics Overview - All status keys:', Object.keys(byStatus));
    console.log('Analytics Overview - Leave match query:', leaveMatch);

    // Leaves by type
    const leavesByTypeAgg = await Leave.aggregate([
      { $match: leaveMatch },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);
    const leavesByType = {};
    (leavesByTypeAgg || []).forEach(t => leavesByType[t._id] = t.count);

    // Users count for company (used for avg tasks per user)
    const usersCount = await User.countDocuments(cid ? { $or: [{ companyId: cid }, { companyId: cid.toString() }] } : {});

    // Overdue tasks: consider multiple possible due fields and status synonyms
    const now = new Date();
    const overdueMatch = {
      $and: [
        { status: { $nin: ['completed', 'done', 'closed', 'blocked', 'cancelled', 'on_hold', 'paused'] } },
        { $or: [{ dueDate: { $lt: now } }, { deadline: { $lt: now } }, { endDate: { $lt: now } }, { due: { $lt: now } }] }
      ]
    };
    if (cid) {
      overdueMatch.$and.push({ $or: [{ companyId: cid }, { companyId: cid.toString() }] });
    }
    const overdue = await Task.countDocuments(overdueMatch);
    // Also log a sample overdue task for debugging
    try {
      const sampleOverdue = await Task.findOne(overdueMatch).lean();
      console.log('Sample overdue task:', sampleOverdue ? { id: sampleOverdue._id, companyId: sampleOverdue.companyId, dueDate: sampleOverdue.dueDate || sampleOverdue.deadline || sampleOverdue.endDate || sampleOverdue.due, status: sampleOverdue.status } : null);
    } catch (e) {
      console.warn('Sample overdue lookup failed:', e && e.message);
    }

    // Ensure urgent bucket exists - only count urgent priority tasks
    const urgentTasks = tasksByPriority['urgent'] || 0;

    // Recent leaves (latest 5)
    const recentLeavesAgg = await Leave.aggregate([
      { $match: leaveMatch },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { id: '$_id', leaveType: '$type', startDate: 1, endDate: 1, status: 1, employeeName: { $ifNull: ['$user.name', { $concat: ['$user.firstName', ' ', '$user.lastName'] }] } } }
    ]);

    // Debug log for KPI counts to troubleshoot zero values
    try {
      console.log('Analytics overview debug:', {
        cid: cid ? cid.toString() : null,
        totalTasks,
        usersCount,
        overdue,
        urgentTasks,
        tasksByPriority
      });
    } catch (e) {
      console.warn('Analytics overview debug log failed:', e && e.message);
    }

    res.json({ success: true, data: { totalTasks, tasksByStatus, tasksByPriority, topPerformers, byDepartment, totalLeaves, leavesByStatus: byStatus, leavesByType: leavesByType || {}, recentLeaves: recentLeavesAgg || [], usersCount, overdue, urgentTasks } });
  } catch (err) {
    console.error('Analytics overview error:', err);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Backwards-compatible route: /api/analytics/dashboard -> same as /overview
router.get('/dashboard', requireRole(['admin', 'super_admin', 'hr', 'hr_manager']), requireCompanyAccess, async (req, res) => {
  try {
    const { companyId: queryCompanyId, startDate, endDate } = req.query;
    let cid = null;
    if (req.user && req.user.role !== 'super_admin') {
      cid = req.user.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : null;
    } else if (queryCompanyId) {
      cid = new mongoose.Types.ObjectId(queryCompanyId);
    }
    const start = startDate ? new Date(startDate) : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
    const end = endDate ? new Date(endDate) : new Date();

    const match = { startDate: { $gte: start, $lte: end } };
    if (cid) match.companyId = cid;

    // Tasks summary
    const taskMatch = {};
    if (cid) taskMatch.companyId = cid;
    const totalTasks = await Task.countDocuments(taskMatch);
    const tasksByStatusAgg = await Task.aggregate([
      { $match: taskMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const tasksByStatus = {};
    (tasksByStatusAgg || []).forEach(s => tasksByStatus[s._id] = s.count);
    const tasksByPriorityAgg = await Task.aggregate([
      { $match: taskMatch },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);
    const tasksByPriority = {};
    (tasksByPriorityAgg || []).forEach(p => tasksByPriority[p._id] = p.count);
    const topPerformers2 = await Task.aggregate([
      { $match: taskMatch },
      { $group: { _id: '$assignedTo', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } },
      { $sort: { completed: -1, total: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'departments', let: { deptId: '$user.departmentId' }, pipeline: [{ $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$deptId'] } } }, { $project: { name: 1 } }], as: 'dept' } },
      { $addFields: { departmentName: { $ifNull: [{ $arrayElemAt: ['$dept.name', 0] }, '$user.departmentName', null] } } },
      { $project: { user: { _id: '$user._id', firstName: '$user.firstName', lastName: '$user.lastName', name: { $concat: ['$user.firstName', ' ', '$user.lastName'] }, email: '$user.email', departmentId: '$user.departmentId' }, total: 1, completed: 1, completionRate: { $cond: [{ $eq: ['$total', 0] }, 0, { $multiply: [{ $divide: ['$completed', '$total'] }, 100] }] }, departmentName: 1 } }
    ]);
    // Log sample for dashboard route too
    try {
      console.log('TopPerformers (dashboard) sample:', topPerformers2.slice(0, 10).map(p => ({ userId: p.user?._id, userDeptId: p.user?.departmentId, departmentName: p.departmentName })));
    } catch (e) {
      console.warn('TopPerformers (dashboard) logging failed:', e && e.message);
    }
    // Dashboard route: same departments pipeline
    const deptMatch = cid ? { companyId: cid } : {};
    const lookupPipeline = [];
    lookupPipeline.push({ $match: { $expr: { $eq: [{ $toString: '$departmentId' }, { $toString: '$$deptId' }] } } });
    if (cid) lookupPipeline.push({ $match: { companyId: cid } });

    const deptPipeline2 = [
      { $match: deptMatch },
      {
        $lookup: {
          from: 'tasks',
          let: { deptId: '$_id' },
          pipeline: lookupPipeline,
          as: 'tasks'
        }
      },
      { $addFields: { total: { $size: '$tasks' }, completed: { $size: { $filter: { input: '$tasks', as: 't', cond: { $eq: ['$$t.status', 'completed'] } } } } } },
      { $lookup: { from: 'users', let: { deptId: '$_id' }, pipeline: [{ $match: { $expr: { $eq: [{ $toString: '$departmentId' }, { $toString: '$$deptId' }] } } }, { $count: 'count' }], as: 'usersCount' } },
      { $addFields: { members: { $ifNull: [{ $arrayElemAt: ['$usersCount.count', 0] }, 0] } } },
      { $project: { departmentId: '$_id', name: '$name', total: 1, completed: 1, members: 1, completionRate: { $cond: [{ $eq: ['$total', 0] }, 0, { $multiply: [{ $divide: ['$completed', '$total'] }, 100] }] } } }
    ];
    const byDepartment2 = await Department.aggregate(deptPipeline2);

    // Leaves - simplified query using createdAt
    const leaveMatch2 = { createdAt: { $gte: start, $lte: end } };
    if (cid) leaveMatch2.companyId = cid;

    const totalLeaves = await Leave.countDocuments(leaveMatch2);
    const leavesByStatus = await Leave.aggregate([
      { $match: leaveMatch2 },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const byStatus = {};
    (leavesByStatus || []).forEach(s => byStatus[s._id] = s.count);

    // Ensure all status types are present with default 0 values
    const defaultStatuses = ['pending', 'approved', 'rejected', 'cancelled'];
    defaultStatuses.forEach(status => {
      if (!(status in byStatus)) {
        byStatus[status] = 0;
      }
    });

    res.json({ success: true, data: { totalTasks, tasksByStatus, tasksByPriority, topPerformers: topPerformers2, byDepartment: byDepartment2, totalLeaves, leavesByStatus: byStatus } });
  } catch (err) {
    console.error('Analytics dashboard error:', err);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// @route GET /api/analytics/leaves/timeseries
// @desc  Leaves time series grouped by date
router.get('/leaves/timeseries', requireRole(['admin', 'super_admin', 'hr', 'hr_manager']), requireCompanyAccess, async (req, res) => {
  try {
    const { companyId: queryCompanyId, startDate, endDate, groupBy } = req.query;
    let cid = null;
    if (req.user && req.user.role !== 'super_admin') {
      cid = req.user.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : null;
    } else if (queryCompanyId) {
      cid = new mongoose.Types.ObjectId(queryCompanyId);
    }
    const start = startDate ? new Date(startDate) : new Date(new Date().setMonth(new Date().getMonth() - 3));
    const end = endDate ? new Date(endDate) : new Date();
    const unit = groupBy === 'month' ? 'month' : 'day';

    const match = { startDate: { $gte: start, $lte: end } };
    if (cid) match.companyId = cid;

    const pipeline = [
      { $match: match },
      { $group: { _id: { $dateTrunc: { date: '$startDate', unit: unit } }, count: { $sum: 1 } } },
      { $sort: { '_id': 1 } }
    ];

    const rows = await Leave.aggregate(pipeline);
    res.json({ success: true, data: rows.map(r => ({ date: r._id, count: r.count })) });
  } catch (err) {
    console.error('Leaves timeseries error:', err);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// @route GET /api/analytics/tasks/timeseries
// @desc  Tasks time series grouped by date (createdAt)
router.get('/tasks/timeseries', requireRole(['admin', 'super_admin', 'hr', 'hr_manager']), requireCompanyAccess, async (req, res) => {
  try {
    const { companyId: queryCompanyId, startDate, endDate, groupBy } = req.query;
    let cid = null;
    if (req.user && req.user.role !== 'super_admin') {
      cid = req.user.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : null;
    } else if (queryCompanyId) {
      cid = new mongoose.Types.ObjectId(queryCompanyId);
    }
    const start = startDate ? new Date(startDate) : new Date(new Date().setMonth(new Date().getMonth() - 1));
    const end = endDate ? new Date(endDate) : new Date();
    const unit = groupBy === 'month' ? 'month' : 'day';

    // Run two aggregates and merge by date:
    // 1) totals by createdAt
    const totalMatch = { createdAt: { $gte: start, $lte: end } };
    if (cid) totalMatch.companyId = cid;

    const totalPipeline = [
      { $match: totalMatch },
      { $group: { _id: { $dateTrunc: { date: '$createdAt', unit: unit } }, total: { $sum: 1 } } },
      { $sort: { '_id': 1 } }
    ];

    // 2) completeds by completedDate (count tasks completed on that date)
    const completedMatch = { completedDate: { $gte: start, $lte: end } };
    if (cid) completedMatch.companyId = cid;

    const completedPipeline = [
      { $match: completedMatch },
      { $group: { _id: { $dateTrunc: { date: '$completedDate', unit: unit } }, completed: { $sum: 1 } } },
      { $sort: { '_id': 1 } }
    ];

    const [totalRows, completedRows] = await Promise.all([
      Task.aggregate(totalPipeline),
      Task.aggregate(completedPipeline)
    ]);

    // Merge into a single time series map keyed by ISO date string
    const map = {};
    (totalRows || []).forEach((r) => { const k = new Date(r._id).toISOString(); map[k] = { date: r._id, total: r.total, completed: 0 }; });
    (completedRows || []).forEach((r) => { const k = new Date(r._id).toISOString(); if (!map[k]) map[k] = { date: r._id, total: 0, completed: r.completed }; else map[k].completed = r.completed; });

    const merged = Object.values(map).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    res.json({ success: true, data: merged.map((r) => ({ date: r.date, total: r.total, completed: r.completed })) });
  } catch (err) {
    console.error('Tasks timeseries error:', err);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// @route GET /api/analytics/leaves/top
// @desc  Top employees by leave days
router.get('/leaves/top', requireRole(['admin', 'super_admin', 'hr', 'hr_manager']), requireCompanyAccess, async (req, res) => {
  try {
    const { companyId: queryCompanyId, startDate, endDate, limit = 10 } = req.query;
    let cid = null;
    if (req.user && req.user.role !== 'super_admin') {
      cid = req.user.companyId ? mongoose.Types.ObjectId(req.user.companyId) : null;
    } else if (queryCompanyId) {
      cid = mongoose.Types.ObjectId(queryCompanyId);
    }
    const start = startDate ? new Date(startDate) : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
    const end = endDate ? new Date(endDate) : new Date();

    const match = { startDate: { $gte: start, $lte: end } };
    if (cid) match.companyId = cid;

    const pipeline = [
      { $match: match },
      { $group: { _id: '$userId', totalDays: { $sum: '$days' } } },
      { $sort: { totalDays: -1 } },
      { $limit: parseInt(limit, 10) },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { userId: '$_id', totalDays: 1, user: { _id: 1, firstName: '$user.firstName', lastName: '$user.lastName', email: '$user.email' } } }
    ];

    const rows = await Leave.aggregate(pipeline);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Leaves top error:', err);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// @route GET /api/analytics/active-tasks
// @desc  Get recent active tasks (in progress, assigned, not overdue)
// @access Admin, HR, HR Manager
router.get('/active-tasks', requireRole(['admin', 'super_admin', 'hr', 'hr_manager']), requireCompanyAccess, async (req, res) => {
  try {
    const { companyId: queryCompanyId, limit = 10 } = req.query;
    let cid = null;
    if (req.user && req.user.role !== 'super_admin') {
      cid = req.user.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : null;
    } else if (queryCompanyId) {
      cid = new mongoose.Types.ObjectId(queryCompanyId);
    }

    // Active tasks criteria:
    // - Status is 'in_progress' or 'assigned'
    // - Created within last 30 days
    // - NOT overdue (due date is in future or null)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const now = new Date();

    const match = {
      $and: [
        {
          $or: [
            { status: 'in_progress' },
            { status: 'assigned' }
          ]
        },
        { createdAt: { $gte: thirtyDaysAgo } },
        // EXCLUDE overdue tasks - only show tasks with future due dates or no due date
        {
          $or: [
            { dueDate: { $gt: now } },
            { dueDate: null }
          ]
        }
      ]
    };

    if (cid) {
      match.$and.push({ $or: [{ companyId: cid }, { companyId: cid.toString() }] });
    }

    const pipeline = [
      { $match: match },
      { $sort: { updatedAt: -1, createdAt: -1 } },
      { $limit: parseInt(limit, 10) },
      {
        $lookup: {
          from: 'users',
          localField: 'assignedTo',
          foreignField: '_id',
          as: 'assignedUser'
        }
      },
      { $unwind: { path: '$assignedUser', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'departments',
          let: { deptId: '$departmentId' },
          pipeline: [
            { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$deptId'] } } },
            { $project: { name: 1 } }
          ],
          as: 'department'
        }
      },
      { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          id: '$_id',
          title: 1,
          description: 1,
          status: 1,
          priority: 1,
          dueDate: 1,
          createdAt: 1,
          updatedAt: 1,
          assignedTo: 1,
          departmentId: 1,
          assignedUser: {
            _id: '$assignedUser._id',
            firstName: '$assignedUser.firstName',
            lastName: '$assignedUser.lastName',
            name: { $concat: ['$assignedUser.firstName', ' ', '$assignedUser.lastName'] }
          },
          department: {
            _id: '$department._id',
            name: '$department.name'
          }
        }
      }
    ];

    const activeTasks = await Task.aggregate(pipeline);

    // Also get total count of active tasks
    const totalActiveTasks = await Task.countDocuments(match);

    // Debug log for active tasks
    console.log('Active tasks debug:', {
      cid: cid ? cid.toString() : null,
      totalActiveTasks,
      activeTasksCount: activeTasks?.length || 0,
      match: JSON.stringify(match, null, 2)
    });

    res.json({
      success: true,
      data: {
        tasks: activeTasks,
        total: totalActiveTasks,
        limit: parseInt(limit, 10)
      }
    });
  } catch (err) {
    console.error('Active tasks error:', err);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// @route GET /api/analytics/hod/overview
// @desc  HOD Dashboard Overview - Department specific analytics
// @access HOD, Admin, Super Admin
router.get('/hod/overview', requireRole(['department_head', 'admin', 'super_admin', 'member']), requireCompanyAccess, async (req, res) => {
  try {
    const { companyId: queryCompanyId, departmentId } = req.query;

    // Get company ID
    let cid = null;
    if (req.user && req.user.role !== 'super_admin') {
      cid = req.user.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : null;
    } else if (queryCompanyId) {
      cid = new mongoose.Types.ObjectId(queryCompanyId);
    }

    // Get department ID - if HOD, use their department
    let deptId = departmentId;
    if (req.user && (req.user.role === 'hod' || req.user.role === 'department_head') && !deptId) {
      deptId = req.user.departmentId;
    }
    if (deptId) deptId = new mongoose.Types.ObjectId(deptId);

    console.log('HOD Overview - User:', req.user?.firstName, req.user?.role);
    console.log('HOD Overview - Company ID:', cid);
    console.log('HOD Overview - Department ID:', deptId);

    const start = new Date(new Date().setFullYear(new Date().getFullYear() - 1));
    const end = new Date();

    // Department match condition
    const deptMatch = {};
    if (cid) deptMatch.companyId = cid;
    if (deptId) deptMatch._id = deptId;

    // Task match condition for department
    const taskDeptMatch = {};
    if (cid) taskDeptMatch.$or = [{ companyId: cid }, { companyId: cid.toString() }];
    if (deptId) taskDeptMatch.departmentId = deptId;

    // User match condition for department
    const userDeptMatch = {};
    if (cid) userDeptMatch.$or = [{ companyId: cid }, { companyId: cid.toString() }];
    if (deptId) userDeptMatch.departmentId = deptId;

    console.log('HOD Overview - Task match:', taskDeptMatch);
    console.log('HOD Overview - User match:', userDeptMatch);

    // Get department info
    const department = await Department.findOne(deptMatch).populate('headId managerIds');
    console.log('HOD Overview - Department found:', department ? department.name : 'None');

    // Get department members
    const departmentMembers = await User.find(userDeptMatch).select('firstName lastName email role isActive departmentId avatar');
    console.log('HOD Overview - Department members count:', departmentMembers.length);

    // Get department tasks
    const totalTasks = await Task.countDocuments(taskDeptMatch);
    const tasksByStatus = await Task.aggregate([
      { $match: taskDeptMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const tasksByPriority = await Task.aggregate([
      { $match: taskDeptMatch },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    // Process task stats
    const taskStats = { total: 0, completed: 0, in_progress: 0, assigned: 0, blocked: 0 };
    tasksByStatus.forEach(s => {
      taskStats[s._id] = s.count;
      taskStats.total += s.count;
    });

    const priorityStats = { urgent: 0, high: 0, medium: 0, low: 0 };
    tasksByPriority.forEach(p => {
      priorityStats[p._id] = p.count;
    });

    // Get recent tasks (last 5, excluding completed and overdue)
    const currentDate = new Date();
    const recentTasks = await Task.find({
      ...taskDeptMatch,
      status: { $ne: 'completed' },
      // Exclude overdue tasks (dueDate < current date)
      $or: [
        { dueDate: { $exists: false } },
        { dueDate: null },
        { dueDate: { $gte: currentDate } }
      ]
    })
      .populate('assignedTo', 'firstName lastName email')
      .populate('assignedBy', 'firstName lastName role')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get leave requests for department
    const leaveMatch = { createdAt: { $gte: start, $lte: end } };
    if (cid) leaveMatch.$or = [{ companyId: cid }, { companyId: cid.toString() }];
    if (deptId) leaveMatch.departmentId = deptId;

    const totalLeaves = await Leave.countDocuments(leaveMatch);
    const leavesByStatus = await Leave.aggregate([
      { $match: leaveMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const leaveStats = { total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    leavesByStatus.forEach(s => {
      leaveStats[s._id] = s.count;
      leaveStats.total += s.count;
    });

    // Get recent leave requests
    const recentLeaveRequests = await Leave.find(leaveMatch)
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(3);

    // Calculate productivity metrics
    const completionRate = taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0;
    const activeMembers = departmentMembers.filter(m => m.isActive).length;
    const overdueTasks = await Task.countDocuments({
      ...taskDeptMatch,
      status: { $nin: ['completed', 'done'] },
      dueDate: { $lt: new Date() }
    });

    // Get today's tasks and meetings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayTasks = await Task.countDocuments({
      ...taskDeptMatch,
      createdAt: { $gte: today, $lt: tomorrow }
    });

    // Get HOD's personal tasks
    const hodTasks = await Task.find({
      assignedTo: req.user._id,
      companyId: cid
    }).populate('assignedBy', 'firstName lastName role');

    const hodTaskStats = {
      total: hodTasks.length,
      pending: hodTasks.filter(t => t.status === 'assigned' || t.status === 'in_progress').length,
      completed: hodTasks.filter(t => t.status === 'completed').length,
      fromSuperAdmin: hodTasks.filter(t => t.assignedBy?.role === 'super_admin').length
    };

    // Debug logging
    console.log('HOD Overview - Final stats:', {
      department: department?.name,
      members: departmentMembers.length,
      tasks: taskStats,
      leaves: leaveStats,
      hodTasks: hodTaskStats
    });

    res.json({
      success: true,
      data: {
        department: department ? {
          id: department._id,
          name: department.name,
          description: department.description,
          color: department.color,
          head: department.headId,
          managers: department.managerIds
        } : null,
        members: {
          total: departmentMembers.length,
          active: activeMembers,
          list: departmentMembers.slice(0, 5).map(m => ({
            id: m._id,
            name: `${m.firstName} ${m.lastName}`,
            email: m.email,
            role: m.role,
            isActive: m.isActive,
            avatar: m.avatar
          }))
        },
        tasks: {
          ...taskStats,
          recent: recentTasks.map(t => ({
            id: t._id,
            title: t.title,
            description: t.description,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
            createdAt: t.createdAt,
            assignedTo: t.assignedTo,
            assignedBy: t.assignedBy
          })),
          urgent: priorityStats.urgent || priorityStats.high || 0,
          overdue: overdueTasks,
          todayCreated: todayTasks
        },
        leaves: {
          ...leaveStats,
          recent: recentLeaveRequests.map(l => ({
            id: l._id,
            type: l.type,
            status: l.status,
            startDate: l.startDate,
            endDate: l.endDate,
            days: l.days,
            reason: l.reason,
            employee: l.userId ? {
              id: l.userId._id,
              name: `${l.userId.firstName} ${l.userId.lastName}`,
              email: l.userId.email
            } : null
          }))
        },
        hodTasks: {
          ...hodTaskStats,
          list: hodTasks.filter(t => t.status !== 'completed').slice(0, 3).map(t => ({
            id: t._id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
            createdAt: t.createdAt,
            assignedBy: t.assignedBy
          }))
        },
        metrics: {
          completionRate,
          teamEfficiency: departmentMembers.length > 0 ? Math.round((activeMembers / departmentMembers.length) * 100) : 0,
          onTimeDelivery: taskStats.total > 0 ? Math.round(Math.max(0, 100 - (overdueTasks / taskStats.total) * 100)) : 100
        }
      }
    });
  } catch (err) {
    console.error('HOD overview error:', err);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// @route GET /api/analytics/hod/tasks
// @desc  HOD's personal tasks with detailed info
// @access HOD, Admin, Super Admin
router.get('/hod/tasks', requireRole(['hod', 'department_head', 'admin', 'super_admin']), requireCompanyAccess, async (req, res) => {
  try {
    const { companyId: queryCompanyId, status, priority, limit = 10 } = req.query;

    let cid = null;
    if (req.user && req.user.role !== 'super_admin') {
      cid = req.user.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : null;
    } else if (queryCompanyId) {
      cid = new mongoose.Types.ObjectId(queryCompanyId);
    }

    const match = { assignedTo: req.user._id };
    if (cid) match.companyId = cid;
    if (status) match.status = status;
    if (priority) match.priority = priority;

    const tasks = await Task.find(match)
      .populate('assignedBy', 'firstName lastName role')
      .populate('departmentId', 'name color')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: tasks.map(t => ({
        id: t._id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        assignedBy: t.assignedBy,
        department: t.departmentId,
        isFromSuperAdmin: t.assignedBy?.role === 'super_admin'
      }))
    });
  } catch (err) {
    console.error('HOD tasks error:', err);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// @route GET /api/analytics/hod/department/tasks
// @desc  Department tasks for HOD
// @access HOD, Admin, Super Admin, HR, HR Manager
router.get('/hod/department/tasks', requireRole(['hod', 'department_head', 'admin', 'super_admin', 'member', 'hr', 'hr_manager']), requireCompanyAccess, async (req, res) => {
  try {
    const { companyId: queryCompanyId, departmentId, status, limit = 20 } = req.query;

    let cid = null;
    if (req.user && req.user.role !== 'super_admin') {
      cid = req.user.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : null;
    } else if (queryCompanyId) {
      cid = new mongoose.Types.ObjectId(queryCompanyId);
    }

    let deptId = departmentId;
    if (req.user && (req.user.role === 'hod' || req.user.role === 'department_head') && !deptId) {
      deptId = req.user.departmentId;
    }

    const match = {};
    if (cid) match.$or = [{ companyId: cid }, { companyId: cid.toString() }];
    if (deptId) match.departmentId = deptId;
    if (status) match.status = status;

    const tasks = await Task.find(match)
      .populate('assignedTo', 'firstName lastName email')
      .populate('assignedBy', 'firstName lastName role')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: tasks.map(t => ({
        id: t._id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        createdAt: t.createdAt,
        assignedTo: t.assignedTo,
        assignedBy: t.assignedBy,
        isFromSuperAdmin: t.assignedBy?.role === 'super_admin'
      }))
    });
  } catch (err) {
    console.error('HOD department tasks error:', err);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// @route GET /api/analytics/hod/user/tasks/:userId
// @desc  Get tasks for a specific user (for "View Tasks" modal in Team Management)
// @access HOD, Admin, Super Admin
router.get('/hod/user/tasks/:userId', requireRole(['hod', 'department_head', 'admin', 'super_admin', 'member']), requireCompanyAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const { companyId: queryCompanyId } = req.query;

    console.log('Fetching tasks for user:', userId);

    // Get company ID
    let cid = null;
    if (req.user && req.user.role !== 'super_admin') {
      cid = req.user.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : null;
    } else if (queryCompanyId) {
      cid = new mongoose.Types.ObjectId(queryCompanyId);
    }

    // Verify user exists
    const user = await User.findById(userId).select('firstName lastName email role departmentId');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check access permissions
    if (req.user.role === 'department_head') {
      // HOD can only view tasks for users in their department
      if (req.user.departmentId !== user.departmentId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
    }

    // Build task match query
    const taskMatch = {
      assignedTo: new mongoose.Types.ObjectId(userId)
    };
    if (cid) {
      taskMatch.$or = [{ companyId: cid }, { companyId: cid.toString() }];
    }

    console.log('Task match query:', taskMatch);

    // Fetch all tasks for the user
    const allTasks = await Task.find(taskMatch)
      .populate('assignedTo', 'firstName lastName email role')
      .populate('assignedBy', 'firstName lastName email role')
      .populate('departmentId', 'name')
      .sort({ createdAt: -1 });

    console.log('Found tasks for user:', allTasks.length);

    // Categorize tasks
    const now = new Date();
    const activeTasks = [];
    const completedTasks = [];
    const blockedTasks = [];
    const overdueTasks = [];

    allTasks.forEach(task => {
      const taskObj = {
        id: task._id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        assignedTo: task.assignedTo ? {
          id: task.assignedTo._id,
          name: `${task.assignedTo.firstName} ${task.assignedTo.lastName}`,
          email: task.assignedTo.email,
          role: task.assignedTo.role
        } : null,
        assignedBy: task.assignedBy ? {
          id: task.assignedBy._id,
          name: `${task.assignedBy.firstName} ${task.assignedBy.lastName}`,
          email: task.assignedBy.email,
          role: task.assignedBy.role
        } : null,
        department: task.departmentId ? {
          id: task.departmentId._id,
          name: task.departmentId.name
        } : null
      };

      // Categorize
      if (task.status === 'completed') {
        completedTasks.push(taskObj);
      } else if (task.status === 'blocked') {
        blockedTasks.push(taskObj);
      } else if (['in_progress', 'assigned', 'pending'].includes(task.status)) {
        activeTasks.push(taskObj);

        // Check if overdue
        if (task.dueDate && new Date(task.dueDate) < now) {
          overdueTasks.push(taskObj);
        }
      }
    });

    // Calculate stats
    const stats = {
      total: allTasks.length,
      active: activeTasks.length,
      completed: completedTasks.length,
      blocked: blockedTasks.length,
      overdue: overdueTasks.length,
      completionRate: allTasks.length > 0 ? Math.round((completedTasks.length / allTasks.length) * 100) : 0,
      overdueRate: allTasks.length > 0 ? Math.round((overdueTasks.length / allTasks.length) * 100) : 0
    };

    // Format all tasks
    const allTasksFormatted = allTasks.map(task => ({
      id: task._id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      assignedTo: task.assignedTo ? {
        id: task.assignedTo._id,
        name: `${task.assignedTo.firstName} ${task.assignedTo.lastName}`,
        email: task.assignedTo.email,
        role: task.assignedTo.role
      } : null,
      assignedBy: task.assignedBy ? {
        id: task.assignedBy._id,
        name: `${task.assignedBy.firstName} ${task.assignedBy.lastName}`,
        email: task.assignedBy.email,
        role: task.assignedBy.role
      } : null,
      department: task.departmentId ? {
        id: task.departmentId._id,
        name: task.departmentId.name
      } : null
    }));

    console.log('Task stats:', stats);

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role
        },
        tasks: {
          active: activeTasks,
          completed: completedTasks,
          blocked: blockedTasks,
          overdue: overdueTasks,
          all: allTasksFormatted
        },
        stats,
        lastUpdated: new Date()
      }
    });
  } catch (err) {
    console.error('Get user tasks error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal error',
      message: err.message
    });
  }
});

// @route GET /api/analytics/hod/department/members
// @desc  Department members for HOD
// @access HOD, Admin, Super Admin
router.get('/hod/department/members', requireRole(['hod', 'department_head', 'admin', 'super_admin', 'member', 'hr', 'hr_manager']), requireCompanyAccess, async (req, res) => {
  try {
    const { companyId: queryCompanyId, departmentId } = req.query;

    let cid = null;
    if (req.user && req.user.role !== 'super_admin') {
      cid = req.user.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : null;
    } else if (queryCompanyId) {
      cid = new mongoose.Types.ObjectId(queryCompanyId);
    }

    let deptId = departmentId;
    if (req.user && (req.user.role === 'hod' || req.user.role === 'department_head') && !deptId) {
      deptId = req.user.departmentId;
    }

    const match = {};
    if (cid) match.$or = [{ companyId: cid }, { companyId: cid.toString() }];
    if (deptId) match.departmentId = deptId;

    const members = await User.find(match)
      .select('firstName lastName email role isActive departmentId avatar lastLogin')
      .sort({ firstName: 1 });

    // Get task counts for each member
    const memberStats = await Promise.all(members.map(async (member) => {
      const taskMatch = {
        assignedTo: member._id,
        companyId: cid
      };

      const memberTasks = await Task.find(taskMatch);
      const taskStats = {
        total: memberTasks.length,
        completed: memberTasks.filter(t => t.status === 'completed').length,
        pending: memberTasks.filter(t => t.status === 'assigned' || t.status === 'in_progress').length,
        overdue: memberTasks.filter(t => t.dueDate < new Date() && !['completed', 'blocked', 'cancelled', 'on_hold', 'paused'].includes(t.status?.toLowerCase())).length
      };

      return {
        id: member._id,
        name: `${member.firstName} ${member.lastName}`,
        email: member.email,
        role: member.role,
        isActive: member.isActive,
        avatar: member.avatar,
        lastLogin: member.lastLogin,
        tasks: taskStats
      };
    }));

    res.json({
      success: true,
      data: memberStats
    });
  } catch (err) {
    console.error('HOD department members error:', err);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// @route GET /api/analytics/hod/team/overview
// @desc  Enhanced HOD Team Overview with comprehensive analytics
// @access HOD, Admin, Super Admin
router.get('/hod/team/overview', requireRole(['hod', 'department_head', 'admin', 'super_admin']), requireCompanyAccess, async (req, res) => {
  try {
    const { companyId: queryCompanyId, departmentId, timeRange = '30d' } = req.query;

    // Get company ID
    let cid = null;
    if (req.user && req.user.role !== 'super_admin') {
      cid = req.user.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : null;
    } else if (queryCompanyId) {
      cid = new mongoose.Types.ObjectId(queryCompanyId);
    }

    // Get department ID - if HOD, use their department
    let deptId = departmentId;
    if (req.user && (req.user.role === 'hod' || req.user.role === 'department_head') && !deptId) {
      deptId = req.user.departmentId;
    }
    if (deptId) deptId = new mongoose.Types.ObjectId(deptId);

    // Calculate date range
    let startDate = new Date();
    if (timeRange === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (timeRange === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else {
      startDate = new Date('2020-01-01');
    }

    console.log('HOD Team Overview - User:', req.user?.firstName, req.user?.role);
    console.log('HOD Team Overview - Company ID:', cid);
    console.log('HOD Team Overview - Department ID:', deptId);

    // Match conditions
    const deptMatch = {};
    if (cid) deptMatch.companyId = cid;
    if (deptId) deptMatch._id = deptId;

    const userMatch = {};
    if (cid) userMatch.$or = [{ companyId: cid }, { companyId: cid.toString() }];
    if (deptId) userMatch.departmentId = deptId;

    const taskMatch = { createdAt: { $gte: startDate } };
    if (cid) taskMatch.$or = [{ companyId: cid }, { companyId: cid.toString() }];
    if (deptId) taskMatch.departmentId = deptId;

    // Get department info
    const department = await Department.findOne(deptMatch)
      .populate('headId', 'firstName lastName email role avatar')
      .populate('managerIds', 'firstName lastName email role avatar');

    // Get all department members
    const departmentMembers = await User.find(userMatch)
      .select('firstName lastName email role isActive departmentId avatar createdAt managerId')
      .sort({ role: 1, firstName: 1 });

    // Get all department tasks
    const allTasks = await Task.find(taskMatch)
      .populate('assignedTo', 'firstName lastName email role')
      .populate('assignedBy', 'firstName lastName role')
      .sort({ createdAt: -1 });

    // === TEAM ANALYTICS ===
    const teamStats = {
      totalMembers: departmentMembers.length,
      activeMembers: departmentMembers.filter(m => m.isActive).length,
      departmentHeads: departmentMembers.filter(m => m.role === 'department_head').length,
      managers: departmentMembers.filter(m => m.role === 'manager').length,
      members: departmentMembers.filter(m => m.role === 'member').length,
      newMembers: departmentMembers.filter(m => {
        const memberDate = new Date(m.createdAt);
        return memberDate >= startDate;
      }).length
    };

    // === TASK ANALYTICS ===
    const taskStats = {
      total: allTasks.length,
      completed: allTasks.filter(t => t.status === 'completed').length,
      inProgress: allTasks.filter(t => t.status === 'in_progress').length,
      assigned: allTasks.filter(t => t.status === 'assigned').length,
      blocked: allTasks.filter(t => t.status === 'blocked').length,
      overdue: allTasks.filter(t => t.dueDate < new Date() && !['completed', 'blocked', 'cancelled', 'on_hold', 'paused'].includes(t.status?.toLowerCase())).length,
      highPriority: allTasks.filter(t => t.priority === 'urgent' || t.priority === 'high').length
    };

    // Calculate completion rate
    const completionRate = taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0;

    // === INDIVIDUAL MEMBER ANALYTICS ===
    const memberAnalytics = await Promise.all(
      departmentMembers.map(async (member) => {
        const memberTasks = allTasks.filter(t => t.assignedTo && t.assignedTo._id.toString() === member._id.toString());

        // Check for various completion status values
        const completedStatuses = ['completed', 'done', 'finished', 'closed', 'resolved'];
        const inProgressStatuses = ['in_progress', 'in progress', 'working', 'active'];

        const memberTaskStats = {
          total: memberTasks.length,
          completed: memberTasks.filter(t => completedStatuses.includes(t.status?.toLowerCase())).length,
          inProgress: memberTasks.filter(t => inProgressStatuses.includes(t.status?.toLowerCase())).length,
          overdue: memberTasks.filter(t => t.dueDate < new Date() && !['completed', 'done', 'finished', 'closed', 'resolved', 'blocked', 'cancelled', 'on_hold', 'paused'].includes(t.status?.toLowerCase())).length,
          urgent: memberTasks.filter(t => t.priority === 'urgent').length
        };

        const memberCompletionRate = memberTaskStats.total > 0
          ? Math.round((memberTaskStats.completed / memberTaskStats.total) * 100)
          : 0;

        // Calculate efficiency rating
        let efficiency = 'low';
        if (memberCompletionRate >= 90) efficiency = 'high';
        else if (memberCompletionRate >= 70) efficiency = 'medium';

        return {
          member: {
            id: member._id,
            name: `${member.firstName} ${member.lastName}`,
            email: member.email,
            role: member.role,
            isActive: member.isActive,
            avatar: member.avatar,
            managerId: member.managerId
          },
          tasks: {
            ...memberTaskStats,
            completionRate: memberCompletionRate,
            efficiency,
            recentTasks: memberTasks.slice(0, 3).map(t => ({
              id: t._id,
              title: t.title,
              status: t.status,
              priority: t.priority,
              dueDate: t.dueDate,
              createdAt: t.createdAt
            }))
          }
        };
      })
    );

    // === TOP PERFORMERS ===
    const topPerformers = memberAnalytics
      .filter(m => m.tasks.total > 0)
      .sort((a, b) => b.tasks.completionRate - a.tasks.completionRate)
      .slice(0, 5)
      .map(m => ({
        member: m.member,
        completionRate: m.tasks.completionRate,
        totalTasks: m.tasks.total,
        completedTasks: m.tasks.completed
      }));

    // === TEAM HIERARCHY ===
    const teamHierarchy = {
      departmentHead: department?.headId ? {
        id: department.headId._id,
        name: `${department.headId.firstName} ${department.headId.lastName}`,
        email: department.headId.email,
        role: department.headId.role,
        avatar: department.headId.avatar
      } : null,
      managers: department?.managerIds ? department.managerIds.map(manager => ({
        id: manager._id,
        name: `${manager.firstName} ${manager.lastName}`,
        email: manager.email,
        role: manager.role,
        avatar: manager.avatar,
        teamMembers: departmentMembers.filter(m => m.managerId && m.managerId.toString() === manager._id.toString()).map(m => ({
          id: m._id,
          name: `${m.firstName} ${m.lastName}`,
          email: m.email,
          role: m.role,
          isActive: m.isActive,
          avatar: m.avatar
        }))
      })) : [],
      unassignedMembers: departmentMembers.filter(m =>
        !m.managerId &&
        m.role !== 'department_head' &&
        !department?.managerIds?.some(mgr => mgr._id.toString() === m._id.toString())
      ).map(m => ({
        id: m._id,
        name: `${m.firstName} ${m.lastName}`,
        email: m.email,
        role: m.role,
        isActive: m.isActive,
        avatar: m.avatar
      }))
    };

    // === DEPARTMENT PERFORMANCE METRICS ===
    const performanceMetrics = {
      completionRate,
      teamEfficiency: teamStats.totalMembers > 0 ? Math.round((teamStats.activeMembers / teamStats.totalMembers) * 100) : 0,
      onTimeDelivery: taskStats.total > 0 ? Math.round(Math.max(0, 100 - (taskStats.overdue / taskStats.total) * 100)) : 100,
      avgTasksPerMember: teamStats.activeMembers > 0 ? Math.round(taskStats.total / teamStats.activeMembers) : 0,
      taskDistribution: {
        urgent: allTasks.filter(t => t.priority === 'urgent').length,
        high: allTasks.filter(t => t.priority === 'high').length,
        medium: allTasks.filter(t => t.priority === 'medium').length,
        low: allTasks.filter(t => t.priority === 'low').length
      }
    };

    res.json({
      success: true,
      data: {
        department: department ? {
          id: department._id,
          name: department.name,
          description: department.description,
          color: department.color,
          createdAt: department.createdAt
        } : null,
        teamStats,
        taskStats,
        performanceMetrics,
        memberAnalytics,
        topPerformers,
        teamHierarchy,
        timeRange,
        lastUpdated: new Date()
      }
    });
  } catch (err) {
    console.error('HOD Team Overview error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// @route GET /api/analytics/hod/analytics
// @desc  Comprehensive HOD Analytics Dashboard Data
// @access HOD, Admin, Super Admin
router.get('/hod/analytics', requireRole(['hod', 'department_head', 'admin', 'super_admin']), requireCompanyAccess, async (req, res) => {
  try {
    const { companyId: queryCompanyId, departmentId, timeRange = '30d', statusFilter = 'all' } = req.query;

    // Get company ID
    let cid = null;
    if (req.user && req.user.role !== 'super_admin') {
      cid = req.user.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : null;
    } else if (queryCompanyId) {
      cid = new mongoose.Types.ObjectId(queryCompanyId);
    }

    // Get department ID - if HOD, use their department
    let deptId = departmentId;
    if (req.user && (req.user.role === 'hod' || req.user.role === 'department_head') && !deptId) {
      deptId = req.user.departmentId;
    }
    if (deptId) deptId = new mongoose.Types.ObjectId(deptId);

    // Calculate date range
    let startDate = new Date();
    if (timeRange === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (timeRange === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else {
      startDate = new Date('2020-01-01'); // All time
    }

    // Match conditions
    const deptMatch = {};
    if (cid) deptMatch.companyId = cid;
    if (deptId) deptMatch._id = deptId;

    const userMatch = {};
    if (cid) userMatch.$or = [{ companyId: cid }, { companyId: cid.toString() }];
    if (deptId) userMatch.departmentId = deptId;

    const taskMatch = { createdAt: { $gte: startDate } };
    if (cid) taskMatch.$or = [{ companyId: cid }, { companyId: cid.toString() }];
    if (deptId) taskMatch.departmentId = deptId;
    if (statusFilter !== 'all') taskMatch.status = statusFilter;

    // Get department info
    const department = await Department.findOne(deptMatch);

    // Get department members
    const departmentMembers = await User.find(userMatch).select('role isActive');
    const totalMembers = departmentMembers.length;
    const activeMembers = departmentMembers.filter(m => m.isActive).length;

    // Get tasks
    const tasks = await Task.find(taskMatch);

    // --- Summary Stats ---
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
    const assignedTasks = tasks.filter(t => t.status === 'assigned').length;
    const blockedTasks = tasks.filter(t => t.status === 'blocked').length;
    const urgentTasks = tasks.filter(t => t.priority === 'urgent' && t.status !== 'completed').length;

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const avgTasksPerMember = totalMembers > 0 ? Math.round(totalTasks / totalMembers) : 0;

    // --- Charts Data ---

    // 1. Task Status Distribution
    const COLORS = {
      primary: '#3B82F6',
      success: '#10B981',
      warning: '#F59E0B',
      danger: '#EF4444',
      purple: '#8B5CF6'
    };

    const taskStatusData = [
      { name: 'Completed', value: completedTasks, color: COLORS.success },
      { name: 'In Progress', value: inProgressTasks, color: COLORS.primary },
      { name: 'Assigned', value: assignedTasks, color: COLORS.warning },
      { name: 'Blocked', value: blockedTasks, color: COLORS.danger }
    ].filter(d => d.value > 0);

    // 2. Priority Distribution
    const priorityData = [
      { name: 'Urgent', value: tasks.filter(t => t.priority === 'urgent').length, color: COLORS.danger },
      { name: 'High', value: tasks.filter(t => t.priority === 'high').length, color: COLORS.warning },
      { name: 'Medium', value: tasks.filter(t => t.priority === 'medium').length, color: COLORS.primary },
      { name: 'Low', value: tasks.filter(t => t.priority === 'low').length, color: COLORS.success }
    ].filter(d => d.value > 0);

    // 3. Role Distribution
    const roleData = [
      { name: 'Head', value: departmentMembers.filter(m => m.role === 'department_head').length, color: COLORS.purple },
      { name: 'Managers', value: departmentMembers.filter(m => m.role === 'manager').length, color: COLORS.primary },
      { name: 'Members', value: departmentMembers.filter(m => m.role === 'member').length, color: COLORS.success }
    ].filter(d => d.value > 0);

    // 4. Task Trends (Last 7 Days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d;
    });

    const taskTrendData = last7Days.map(date => {
      const dateStr = date.toISOString().split('T')[0];
      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        created: tasks.filter(t => new Date(t.createdAt).toISOString().split('T')[0] === dateStr).length,
        completed: tasks.filter(t => t.status === 'completed' && new Date(t.updatedAt).toISOString().split('T')[0] === dateStr).length,
        fullDate: dateStr
      };
    });

    // 5. Performance Data (Efficiency/Productivity over time)
    // This is a bit more complex to calculate accurately without historical snapshots, 
    // so we'll approximate based on task completion timestamps
    const performanceData = last7Days.map(date => {
      const dateStr = date.toISOString().split('T')[0];
      const dayTasks = tasks.filter(t => new Date(t.updatedAt).toISOString().split('T')[0] <= dateStr);
      const dayCompleted = dayTasks.filter(t => t.status === 'completed').length;
      const dayTotal = dayTasks.length;

      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        efficiency: dayTotal > 0 ? Math.round((dayCompleted / dayTotal) * 100) : 0,
        productivity: Math.min(100, Math.round((dayCompleted / Math.max(1, totalMembers)) * 20)), // Arbitrary scale
        engagement: Math.round((activeMembers / Math.max(1, totalMembers)) * 100)
      };
    });

    // --- Insights ---
    const insights = {
      completionRate: {
        status: completionRate >= 80 ? 'excellent' : completionRate >= 60 ? 'good' : 'needs improvement',
        value: completionRate
      },
      teamEngagement: {
        message: `${Math.round((activeMembers / Math.max(1, totalMembers)) * 100)}% of team members are active.`,
        value: activeMembers
      },
      taskLoad: {
        status: avgTasksPerMember <= 3 ? 'optimal' : avgTasksPerMember <= 5 ? 'moderate' : 'high',
        value: avgTasksPerMember
      },
      priorityFocus: {
        message: urgentTasks > 0 ? `${urgentTasks} urgent tasks require immediate attention.` : 'No urgent tasks pending.',
        value: urgentTasks
      }
    };

    res.json({
      success: true,
      data: {
        department: department ? {
          id: department._id,
          name: department.name,
          memberIds: departmentMembers.map(m => m._id) // For frontend compatibility if needed
        } : null,
        summary: {
          totalMembers,
          activeMembers,
          totalTasks,
          completedTasks,
          inProgressTasks,
          assignedTasks,
          blockedTasks,
          completionRate,
          avgTasksPerMember,
          urgentTasks
        },
        charts: {
          taskStatusData,
          priorityData,
          roleData,
          taskTrendData,
          performanceData
        },
        insights
      }
    });

  } catch (err) {
    console.error('HOD Analytics error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});



// @route GET /api/analytics/hod/team/members-with-tasks
// @desc  Team Members with Task Analytics - Detailed member performance with task breakdown
// @access HOD, Admin, Super Admin
router.get('/hod/team/members-with-tasks', requireRole(['hod', 'department_head', 'admin', 'super_admin']), requireCompanyAccess, async (req, res) => {
  try {
    const { companyId: queryCompanyId, departmentId, timeRange = '30d', searchTerm = '', roleFilter = 'all', statusFilter = 'all' } = req.query;

    // Get company ID
    let cid = null;
    if (req.user && req.user.role !== 'super_admin') {
      cid = req.user.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : null;
    } else if (queryCompanyId) {
      cid = new mongoose.Types.ObjectId(queryCompanyId);
    }

    // Get department ID - if HOD, use their department
    let deptId = departmentId;
    if (req.user && (req.user.role === 'hod' || req.user.role === 'department_head') && !deptId) {
      deptId = req.user.departmentId;
    }
    if (deptId) deptId = new mongoose.Types.ObjectId(deptId);

    // Calculate date range
    let startDate = new Date();
    if (timeRange === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (timeRange === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else {
      startDate = new Date('2020-01-01');
    }

    console.log('Team Members with Tasks - User:', req.user?.firstName, req.user?.role);
    console.log('Team Members with Tasks - Company ID:', cid);
    console.log('Team Members with Tasks - Department ID:', deptId);

    // Debug: Check if there are any tasks at all in the database
    const totalTasksInDB = await Task.countDocuments({});
    console.log('Total tasks in database:', totalTasksInDB);

    // Debug: Check if there are any users at all in the database
    const totalUsersInDB = await User.countDocuments({});
    console.log('Total users in database:', totalUsersInDB);

    // Match conditions
    const userMatch = {};
    if (cid) userMatch.$or = [{ companyId: cid }, { companyId: cid.toString() }];
    if (deptId) userMatch.departmentId = deptId;

    // For completion rate calculation, we need ALL tasks, not just recent ones
    const taskMatch = {}; // Remove date filter for completion rate calculation
    if (cid) taskMatch.$or = [{ companyId: cid }, { companyId: cid.toString() }];
    if (deptId) taskMatch.departmentId = deptId;

    console.log('Task match conditions:', JSON.stringify(taskMatch, null, 2));

    // Get all department members
    const departmentMembers = await User.find(userMatch)
      .select('firstName lastName email role isActive departmentId avatar createdAt managerId lastLogin')
      .sort({ role: 1, firstName: 1 });

    console.log('Department members found:', departmentMembers.map(m => ({
      id: m._id,
      name: `${m.firstName} ${m.lastName}`,
      role: m.role,
      departmentId: m.departmentId,
      companyId: m.companyId
    })));

    // Get all department tasks (no date filter for completion rate calculation)
    console.log('Task query conditions:', taskMatch);
    let allTasks = await Task.find(taskMatch)
      .populate('assignedTo', 'firstName lastName email role')
      .populate('assignedBy', 'firstName lastName role')
      .sort({ createdAt: -1 });

    console.log('Total tasks found for completion rate calculation:', allTasks.length);

    // Debug: Show sample tasks and their assignment
    if (allTasks.length > 0) {
      console.log('Sample tasks found:', allTasks.slice(0, 5).map(t => ({
        id: t._id,
        title: t.title,
        assignedTo: t.assignedTo ? {
          id: t.assignedTo._id,
          name: `${t.assignedTo.firstName} ${t.assignedTo.lastName}`,
          role: t.assignedTo.role
        } : 'No assignedTo',
        status: t.status,
        companyId: t.companyId,
        departmentId: t.departmentId
      })));
    }

    // If no tasks found with filters, try without company/department filters
    if (allTasks.length === 0) {
      console.log('No tasks found with filters, trying without company/department filters...');
      allTasks = await Task.find({})
        .populate('assignedTo', 'firstName lastName email role')
        .populate('assignedBy', 'firstName lastName role')
        .sort({ createdAt: -1 });
      console.log('Total tasks found without any filters:', allTasks.length);

      if (allTasks.length > 0) {
        console.log('Sample tasks without filters:', allTasks.slice(0, 5).map(t => ({
          id: t._id,
          title: t.title,
          assignedTo: t.assignedTo ? {
            id: t.assignedTo._id,
            name: `${t.assignedTo.firstName} ${t.assignedTo.lastName}`,
            role: t.assignedTo.role
          } : 'No assignedTo',
          status: t.status,
          companyId: t.companyId,
          departmentId: t.departmentId
        })));
      }
    }

    // === MEMBER TASK ANALYTICS ===
    console.log('Total department tasks found:', allTasks.length);
    console.log('Department members:', departmentMembers.map(m => ({ id: m._id, name: `${m.firstName} ${m.lastName}`, role: m.role })));

    const userTaskMapping = await Promise.all(
      departmentMembers.map(async (member) => {
        // Use all tasks for completion rate calculation
        const tasksToUse = allTasks;

        // Debug: Show all tasks and their assignedTo values
        console.log('All tasks assignedTo values:', tasksToUse.map(t => ({
          id: t._id,
          title: t.title,
          assignedTo: t.assignedTo?._id,
          assignedToName: t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : 'No assignedTo',
          status: t.status,
          createdAt: t.createdAt
        })));

        const memberTasks = tasksToUse.filter(t => t.assignedTo && t.assignedTo._id.toString() === member._id.toString());

        console.log(`\n=== Member: ${member.firstName} ${member.lastName} (${member.role}) ===`);
        console.log('Member ID:', member._id);
        console.log('Total tasks found for member:', memberTasks.length);

        // Debug: Check if any tasks have this member as assignedTo
        const tasksWithThisMember = tasksToUse.filter(t =>
          t.assignedTo && t.assignedTo._id.toString() === member._id.toString()
        );
        console.log('Tasks with this member as assignedTo:', tasksWithThisMember.length);

        // Debug: Show all assignedTo IDs to see if there's a mismatch
        const allAssignedToIds = tasksToUse.map(t => t.assignedTo?._id?.toString()).filter(Boolean);
        const uniqueAssignedToIds = [...new Set(allAssignedToIds)];
        console.log('All unique assignedTo IDs in tasks:', uniqueAssignedToIds);
        console.log('Current member ID:', member._id.toString());
        console.log('Is member ID in assignedTo IDs?', uniqueAssignedToIds.includes(member._id.toString()));
        console.log('Sample tasks:', memberTasks.slice(0, 3).map(t => ({
          id: t._id,
          title: t.title,
          status: t.status,
          assignedTo: t.assignedTo?._id
        })));

        // Debug: Show all unique status values for this member's tasks
        const uniqueStatuses = [...new Set(memberTasks.map(t => t.status))];
        console.log('Unique task statuses for this member:', uniqueStatuses);

        // Debug: Count tasks by status
        const statusCounts = {};
        memberTasks.forEach(t => {
          statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
        });
        console.log('Task counts by status:', statusCounts);

        // Calculate task statistics
        // Check for various completion status values
        const completedStatuses = ['completed', 'done', 'finished', 'closed', 'resolved'];
        const inProgressStatuses = ['in_progress', 'in progress', 'working', 'active'];
        const assignedStatuses = ['assigned', 'pending', 'new', 'open'];
        const blockedStatuses = ['blocked', 'on_hold', 'on hold', 'paused'];

        const taskStats = {
          total: memberTasks.length,
          completed: memberTasks.filter(t => completedStatuses.includes(t.status?.toLowerCase())).length,
          inProgress: memberTasks.filter(t => inProgressStatuses.includes(t.status?.toLowerCase())).length,
          assigned: memberTasks.filter(t => assignedStatuses.includes(t.status?.toLowerCase())).length,
          blocked: memberTasks.filter(t => blockedStatuses.includes(t.status?.toLowerCase())).length,
          overdue: memberTasks.filter(t => t.dueDate < new Date() && !['completed', 'done', 'finished', 'closed', 'resolved', 'blocked', 'cancelled', 'on_hold', 'paused'].includes(t.status?.toLowerCase())).length,
          urgent: memberTasks.filter(t => t.priority === 'urgent').length,
          high: memberTasks.filter(t => t.priority === 'high').length,
          medium: memberTasks.filter(t => t.priority === 'medium').length,
          low: memberTasks.filter(t => t.priority === 'low').length
        };

        console.log('Task stats with flexible status matching:', taskStats);

        // Calculate performance metrics
        const completionRate = taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0;
        const onTimeRate = taskStats.total > 0 ? Math.round(Math.max(0, 100 - (taskStats.overdue / taskStats.total) * 100)) : 100;

        console.log('Task Stats:', taskStats);
        console.log('Completion Rate:', completionRate);

        // Calculate efficiency rating
        let efficiency = 'low';
        if (completionRate >= 90) efficiency = 'high';
        else if (completionRate >= 70) efficiency = 'medium';

        // Get recent tasks (last 5)
        const recentTasks = memberTasks.slice(0, 5).map(t => ({
          id: t._id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          createdAt: t.createdAt,
          assignedBy: t.assignedBy
        }));

        // Calculate productivity score (0-100)
        const productivityScore = Math.min(100, Math.round(
          (completionRate * 0.4) +
          (onTimeRate * 0.3) +
          (Math.min(100, (taskStats.total / 10) * 100) * 0.3)
        ));

        return {
          member: {
            id: member._id,
            name: `${member.firstName} ${member.lastName}`,
            email: member.email,
            role: member.role,
            isActive: member.isActive,
            avatar: member.avatar,
            managerId: member.managerId,
            lastLogin: member.lastLogin,
            joinedDate: member.createdAt
          },
          tasks: {
            ...taskStats,
            completionRate,
            onTimeRate,
            efficiency,
            productivityScore,
            recentTasks
          }
        };
      })
    );

    // Apply filters
    let filteredResults = userTaskMapping;

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filteredResults = filteredResults.filter(item =>
        item.member.name.toLowerCase().includes(searchLower) ||
        item.member.email.toLowerCase().includes(searchLower)
      );
    }

    // Role filter
    if (roleFilter !== 'all') {
      filteredResults = filteredResults.filter(item => item.member.role === roleFilter);
    }

    // Status filter (active/inactive)
    if (statusFilter !== 'all') {
      const isActive = statusFilter === 'active';
      filteredResults = filteredResults.filter(item => item.member.isActive === isActive);
    }

    // Sort by productivity score (highest first)
    filteredResults.sort((a, b) => b.tasks.productivityScore - a.tasks.productivityScore);

    // === SUMMARY STATISTICS ===
    const summary = {
      totalMembers: departmentMembers.length,
      activeMembers: departmentMembers.filter(m => m.isActive).length,
      totalTasks: allTasks.length,
      completedTasks: allTasks.filter(t => t.status === 'completed').length,
      avgCompletionRate: userTaskMapping.length > 0 ?
        Math.round(userTaskMapping.reduce((sum, item) => sum + item.tasks.completionRate, 0) / userTaskMapping.length) : 0,
      avgProductivityScore: userTaskMapping.length > 0 ?
        Math.round(userTaskMapping.reduce((sum, item) => sum + item.tasks.productivityScore, 0) / userTaskMapping.length) : 0
    };

    // === TOP PERFORMERS ===
    const topPerformers = userTaskMapping
      .filter(m => m.tasks.total > 0)
      .sort((a, b) => b.tasks.productivityScore - a.tasks.productivityScore)
      .slice(0, 5)
      .map(m => ({
        member: m.member,
        productivityScore: m.tasks.productivityScore,
        completionRate: m.tasks.completionRate,
        totalTasks: m.tasks.total,
        completedTasks: m.tasks.completed
      }));

    res.json({
      success: true,
      data: {
        userTaskMapping: filteredResults,
        summary,
        topPerformers,
        filters: {
          searchTerm,
          roleFilter,
          statusFilter,
          timeRange
        },
        lastUpdated: new Date()
      }
    });
  } catch (err) {
    console.error('Team Members with Tasks error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// @route GET /api/analytics/hod/analytics
// @desc  HOD Analytics - Comprehensive department analytics with charts and insights
// @access HOD, Admin, Super Admin
router.get('/hod/analytics', requireRole(['hod', 'department_head', 'admin', 'super_admin', 'member', 'hr', 'hr_manager']), requireCompanyAccess, async (req, res) => {
  try {
    const { companyId: queryCompanyId, departmentId, timeRange = '30d', statusFilter = 'all' } = req.query;

    // Get company ID
    let cid = null;
    if (req.user && req.user.role !== 'super_admin') {
      cid = req.user.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : null;
    } else if (queryCompanyId) {
      cid = new mongoose.Types.ObjectId(queryCompanyId);
    }

    // Get department ID - if HOD, use their department
    let deptId = departmentId;
    if (req.user && (req.user.role === 'hod' || req.user.role === 'department_head') && !deptId) {
      deptId = req.user.departmentId;
    }
    if (deptId) deptId = new mongoose.Types.ObjectId(deptId);

    // Calculate date range
    let startDate = new Date();
    if (timeRange === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (timeRange === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else {
      startDate = new Date('2020-01-01');
    }

    console.log('HOD Analytics - User:', req.user?.firstName, req.user?.role);
    console.log('HOD Analytics - Company ID:', cid);
    console.log('HOD Analytics - Department ID:', deptId);
    console.log('HOD Analytics - Time Range:', timeRange);

    // Match conditions
    const deptMatch = {};
    if (cid) deptMatch.companyId = cid;
    if (deptId) deptMatch._id = deptId;

    const userMatch = {};
    if (cid) userMatch.$or = [{ companyId: cid }, { companyId: cid.toString() }];
    if (deptId) userMatch.departmentId = deptId;

    const taskMatch = { createdAt: { $gte: startDate } };
    if (cid) taskMatch.$or = [{ companyId: cid }, { companyId: cid.toString() }];
    if (deptId) taskMatch.departmentId = deptId;
    if (statusFilter !== 'all') taskMatch.status = statusFilter;

    // Get department info
    const department = await Department.findOne(deptMatch)
      .populate('headId', 'firstName lastName email role avatar')
      .populate('managerIds', 'firstName lastName email role avatar');

    // Get all department members
    const departmentMembers = await User.find(userMatch)
      .select('firstName lastName email role isActive departmentId avatar createdAt managerId')
      .sort({ role: 1, firstName: 1 });

    // Get all department tasks
    const allTasks = await Task.find(taskMatch)
      .populate('assignedTo', 'firstName lastName email role')
      .populate('assignedBy', 'firstName lastName role')
      .sort({ createdAt: -1 });

    // === SUMMARY STATISTICS ===
    const summary = {
      totalMembers: departmentMembers.length,
      activeMembers: departmentMembers.filter(m => m.isActive).length,
      totalTasks: allTasks.length,
      completedTasks: allTasks.filter(t => t.status === 'completed').length,
      inProgressTasks: allTasks.filter(t => t.status === 'in_progress').length,
      assignedTasks: allTasks.filter(t => t.status === 'assigned').length,
      blockedTasks: allTasks.filter(t => t.status === 'blocked').length,
      urgentTasks: allTasks.filter(t => t.priority === 'urgent').length,
      completionRate: allTasks.length > 0 ? Math.round((allTasks.filter(t => t.status === 'completed').length / allTasks.length) * 100) : 0,
      avgTasksPerMember: departmentMembers.filter(m => m.isActive).length > 0 ? Math.round(allTasks.length / departmentMembers.filter(m => m.isActive).length) : 0
    };

    // === CHART DATA ===
    const charts = {
      // Task Status Distribution
      taskStatusData: [
        { name: 'Completed', value: summary.completedTasks, color: '#10B981' },
        { name: 'In Progress', value: summary.inProgressTasks, color: '#3B82F6' },
        { name: 'Assigned', value: summary.assignedTasks, color: '#F59E0B' },
        { name: 'Blocked', value: summary.blockedTasks, color: '#EF4444' }
      ],

      // Task Priority Analysis
      priorityData: [
        { name: 'Urgent', value: allTasks.filter(t => t.priority === 'urgent').length, color: '#EF4444' },
        { name: 'High', value: allTasks.filter(t => t.priority === 'high').length, color: '#F59E0B' },
        { name: 'Medium', value: allTasks.filter(t => t.priority === 'medium').length, color: '#3B82F6' },
        { name: 'Low', value: allTasks.filter(t => t.priority === 'low').length, color: '#10B981' }
      ],

      // Team Role Distribution
      roleData: [
        { name: 'Head', value: departmentMembers.filter(m => m.role === 'department_head').length, color: '#8B5CF6' },
        { name: 'Managers', value: departmentMembers.filter(m => m.role === 'manager').length, color: '#3B82F6' },
        { name: 'Members', value: departmentMembers.filter(m => m.role === 'member').length, color: '#10B981' }
      ]
    };

    // Generate task trend data (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return date;
    });

    charts.taskTrendData = last7Days.map(date => {
      const dateStr = date.toISOString().split('T')[0];
      const tasksCreated = allTasks.filter(task =>
        task.createdAt.toISOString().split('T')[0] === dateStr
      ).length;
      const tasksCompleted = allTasks.filter(task =>
        task.updatedAt.toISOString().split('T')[0] === dateStr && task.status === 'completed'
      ).length;

      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        created: tasksCreated,
        completed: tasksCompleted,
        fullDate: dateStr
      };
    });

    // Performance metrics over time
    charts.performanceData = last7Days.map(date => {
      const dateStr = date.toISOString().split('T')[0];
      const dayTasks = allTasks.filter(task =>
        task.updatedAt.toISOString().split('T')[0] <= dateStr
      );
      const dayCompleted = dayTasks.filter(t => t.status === 'completed').length;
      const dayTotal = dayTasks.length;
      const efficiency = dayTotal > 0 ? Math.round((dayCompleted / dayTotal) * 100) : 0;

      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        efficiency,
        productivity: Math.min(100, Math.round((dayCompleted / Math.max(1, departmentMembers.length)) * 20)),
        engagement: Math.round((summary.activeMembers / Math.max(1, summary.totalMembers)) * 100)
      };
    });

    // === INSIGHTS ===
    const insights = {
      completionRate: {
        status: summary.completionRate >= 80 ? 'excellent' : summary.completionRate >= 60 ? 'good' : 'needs improvement',
        message: `Task completion rate of ${summary.completionRate}% indicates ${summary.completionRate >= 80 ? 'excellent' : summary.completionRate >= 60 ? 'good' : 'room for improvement'} performance.`
      },
      teamEngagement: {
        message: `${Math.round((summary.activeMembers / summary.totalMembers) * 100)}% of team members are actively engaged in current projects.`
      },
      taskLoad: {
        status: summary.avgTasksPerMember <= 3 ? 'optimal' : summary.avgTasksPerMember <= 5 ? 'moderate' : 'high',
        message: `Average of ${summary.avgTasksPerMember} tasks per member indicates ${summary.avgTasksPerMember <= 3 ? 'optimal' : summary.avgTasksPerMember <= 5 ? 'moderate' : 'high'} workload distribution.`
      },
      priorityFocus: {
        message: `${summary.urgentTasks} high-priority tasks need immediate attention.`
      }
    };

    res.json({
      success: true,
      data: {
        department: department ? {
          id: department._id,
          name: department.name,
          description: department.description,
          color: department.color,
          head: department.headId,
          managers: department.managerIds
        } : null,
        summary,
        charts,
        insights,
        timeRange,
        statusFilter,
        lastUpdated: new Date()
      }
    });
  } catch (err) {
    console.error('HOD Analytics error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// @route GET /api/analytics/task-status-distribution
// @desc  Get task status distribution with filtering options (exclude overdue from assigned/in-progress)
// @access Admin, HR, HR Manager, HOD, Super Admin
router.get('/task-status-distribution', requireRole(['admin', 'super_admin', 'hr', 'hr_manager', 'hod', 'department_head']), requireCompanyAccess, async (req, res) => {
  try {
    const {
      companyId: queryCompanyId,
      departmentId,
      excludeOverdue = 'false',
      statusFilter = 'all',
      includeOverdue = 'false',
      managerId
    } = req.query;

    // Get company ID
    let cid = null;
    if (req.user && req.user.role !== 'super_admin') {
      cid = req.user.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : null;
    } else if (queryCompanyId) {
      cid = new mongoose.Types.ObjectId(queryCompanyId);
    }

    // Get department ID - if HOD, use their department
    let deptId = departmentId;
    if (req.user && (req.user.role === 'hod' || req.user.role === 'department_head') && !deptId) {
      deptId = req.user.departmentId;
    }
    if (deptId) deptId = new mongoose.Types.ObjectId(deptId);

    console.log('Task Status Distribution - User:', req.user?.firstName, req.user?.role);
    console.log('Task Status Distribution - Company ID:', cid);
    console.log('Task Status Distribution - Department ID:', deptId);
    console.log('Task Status Distribution - Exclude Overdue:', excludeOverdue);
    console.log('Task Status Distribution - Status Filter:', statusFilter);

    // Build base match conditions
    const baseMatch = {};
    if (cid) baseMatch.$or = [{ companyId: cid }, { companyId: cid.toString() }];
    if (deptId) baseMatch.departmentId = deptId;
    if (managerId) baseMatch.managerId = new mongoose.Types.ObjectId(managerId);

    // Apply status filter if specified
    if (statusFilter !== 'all') {
      baseMatch.status = statusFilter;
    }

    // Get all tasks matching base conditions
    const allTasks = await Task.find(baseMatch)
      .populate('assignedTo', 'firstName lastName email role')
      .populate('assignedBy', 'firstName lastName role')
      .sort({ createdAt: -1 });

    console.log('Total tasks found:', allTasks.length);

    // Current date for overdue calculation
    const now = new Date();

    // Helper function to check if task is overdue
    const isOverdue = (task) => {
      if (!task.dueDate) return false;
      const dueDate = new Date(task.dueDate);
      return dueDate < now && !['completed', 'done', 'closed', 'resolved', 'blocked', 'cancelled', 'on_hold', 'on hold', 'paused'].includes(task.status?.toLowerCase());
    };

    // Calculate task counts with overdue filtering
    let assignedCount = 0;
    let inProgressCount = 0;
    let completedCount = 0;
    let blockedCount = 0;
    let overdueCount = 0;

    allTasks.forEach(task => {
      const taskStatus = task.status?.toLowerCase();
      const taskIsOverdue = isOverdue(task);

      // Count overdue tasks separately
      if (taskIsOverdue) {
        overdueCount++;
      }

      // Count by status with overdue filtering for assigned and in-progress
      if (['assigned', 'pending', 'new', 'open'].includes(taskStatus)) {
        // For assigned tasks, exclude overdue if excludeOverdue is true
        if (excludeOverdue === 'true' && taskIsOverdue) {
          // Don't count this task in assigned
        } else {
          assignedCount++;
        }
      } else if (['in_progress', 'in progress', 'working', 'active'].includes(taskStatus)) {
        // For in-progress tasks, exclude overdue if excludeOverdue is true
        if (excludeOverdue === 'true' && taskIsOverdue) {
          // Don't count this task in in-progress
        } else {
          inProgressCount++;
        }
      } else if (['completed', 'done', 'finished', 'closed', 'resolved'].includes(taskStatus)) {
        completedCount++;
      } else if (['blocked', 'on_hold', 'on hold', 'paused'].includes(taskStatus)) {
        blockedCount++;
      }
    });

    // Prepare response data
    const taskStatusData = [
      { name: 'Assigned', value: assignedCount, color: '#F59E0B' },
      { name: 'In Progress', value: inProgressCount, color: '#3B82F6' },
      { name: 'Completed', value: completedCount, color: '#10B981' },
      { name: 'Blocked', value: blockedCount, color: '#EF4444' }
    ];

    // Include overdue count if requested
    if (includeOverdue === 'true') {
      taskStatusData.push({ name: 'Overdue', value: overdueCount, color: '#DC2626' });
    }

    // Calculate totals
    const totalTasks = assignedCount + inProgressCount + completedCount + blockedCount;
    const totalWithOverdue = totalTasks + overdueCount;

    // Calculate percentages
    const assignedPercentage = totalTasks > 0 ? Math.round((assignedCount / totalTasks) * 100) : 0;
    const inProgressPercentage = totalTasks > 0 ? Math.round((inProgressCount / totalTasks) * 100) : 0;
    const completedPercentage = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
    const blockedPercentage = totalTasks > 0 ? Math.round((blockedCount / totalTasks) * 100) : 0;
    const overduePercentage = totalWithOverdue > 0 ? Math.round((overdueCount / totalWithOverdue) * 100) : 0;

    const response = {
      success: true,
      data: {
        taskStatusData,
        summary: {
          total: totalTasks,
          totalWithOverdue,
          assigned: assignedCount,
          inProgress: inProgressCount,
          completed: completedCount,
          blocked: blockedCount,
          overdue: overdueCount,
          assignedPercentage,
          inProgressPercentage,
          completedPercentage,
          blockedPercentage,
          overduePercentage
        },
        filters: {
          excludeOverdue: excludeOverdue === 'true',
          statusFilter,
          includeOverdue: includeOverdue === 'true',
          companyId: cid,
          departmentId: deptId,
          managerId
        },
        lastUpdated: new Date()
      }
    };

    console.log('Task Status Distribution Response:', {
      assigned: assignedCount,
      inProgress: inProgressCount,
      completed: completedCount,
      blocked: blockedCount,
      overdue: overdueCount,
      excludeOverdue: excludeOverdue === 'true'
    });

    res.json(response);
  } catch (err) {
    console.error('Task status distribution error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// @route GET /api/analytics/hod/user/tasks/:userId
// @desc  Get all tasks for a specific user with detailed information
// @access HOD, Admin, Super Admin
router.get('/hod/user/tasks/:userId', requireRole(['hod', 'department_head', 'admin', 'super_admin']), requireCompanyAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const { companyId: queryCompanyId, departmentId } = req.query;

    // Get company ID
    let cid = null;
    if (req.user && req.user.role !== 'super_admin') {
      cid = req.user.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : null;
    } else if (queryCompanyId) {
      cid = new mongoose.Types.ObjectId(queryCompanyId);
    }

    // Get department ID - if HOD, use their department
    let deptId = departmentId;
    if (req.user && (req.user.role === 'hod' || req.user.role === 'department_head') && !deptId) {
      deptId = req.user.departmentId;
    }
    if (deptId) deptId = new mongoose.Types.ObjectId(deptId);

    // Verify user exists and belongs to the same company/department
    const user = await User.findById(userId).select('firstName lastName email role departmentId companyId');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check if user belongs to the same company
    if (cid && user.companyId && user.companyId.toString() !== cid.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Check if user belongs to the same department (for HOD)
    if (deptId && user.departmentId && user.departmentId.toString() !== deptId.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Build task query
    const taskQuery = { assignedTo: new mongoose.Types.ObjectId(userId) };
    if (cid) {
      taskQuery.$or = [{ companyId: cid }, { companyId: cid.toString() }];
    }
    if (deptId) {
      taskQuery.departmentId = deptId;
    }

    // Fetch tasks with populated fields
    const tasks = await Task.find(taskQuery)
      .populate('assignedTo', 'firstName lastName email role')
      .populate('assignedBy', 'firstName lastName email role')
      .populate('departmentId', 'name')
      .sort({ createdAt: -1 });

    // Categorize tasks
    const now = new Date();
    const categorizedTasks = {
      active: tasks.filter(task => ['in_progress', 'assigned', 'pending'].includes(task.status)),
      completed: tasks.filter(task => task.status === 'completed'),
      blocked: tasks.filter(task => task.status === 'blocked'),
      overdue: tasks.filter(task => {
        const dueDate = new Date(task.dueDate);
        return dueDate < now && !['completed', 'blocked', 'cancelled', 'on_hold', 'paused'].includes(task.status?.toLowerCase());
      }),
      all: tasks
    };

    // Calculate statistics
    const stats = {
      total: tasks.length,
      active: categorizedTasks.active.length,
      completed: categorizedTasks.completed.length,
      blocked: categorizedTasks.blocked.length,
      overdue: categorizedTasks.overdue.length,
      completionRate: tasks.length > 0 ? Math.round((categorizedTasks.completed.length / tasks.length) * 100) : 0,
      overdueRate: tasks.length > 0 ? Math.round((categorizedTasks.overdue.length / tasks.length) * 100) : 0
    };

    // Format tasks for frontend
    const formatTask = (task) => ({
      id: task._id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      assignedTo: {
        id: task.assignedTo._id,
        name: `${task.assignedTo.firstName} ${task.assignedTo.lastName}`,
        email: task.assignedTo.email,
        role: task.assignedTo.role
      },
      assignedBy: task.assignedBy ? {
        id: task.assignedBy._id,
        name: `${task.assignedBy.firstName} ${task.assignedBy.lastName}`,
        email: task.assignedBy.email,
        role: task.assignedBy.role
      } : null,
      department: task.departmentId ? {
        id: task.departmentId._id,
        name: task.departmentId.name
      } : null
    });

    const formattedTasks = {
      active: categorizedTasks.active.map(formatTask),
      completed: categorizedTasks.completed.map(formatTask),
      blocked: categorizedTasks.blocked.map(formatTask),
      overdue: categorizedTasks.overdue.map(formatTask),
      all: categorizedTasks.all.map(formatTask)
    };

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role
        },
        tasks: formattedTasks,
        stats,
        lastUpdated: new Date()
      }
    });

  } catch (err) {
    console.error('User tasks error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;