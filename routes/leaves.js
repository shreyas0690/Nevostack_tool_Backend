const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { Leave, User, Notification } = require('../models');
const { requireRole } = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');
const { sendNotificationToUser, sendUnreadCountUpdate } = require('../websocket');

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

// Apply HOD panel rate limiter to all leave routes
router.use(hodPanelLimiter);

// Helper: check company access for an individual leave
const checkCompanyAccess = (user, leave) => {
  if (['hr', 'admin'].includes(user.role) && leave.companyId.toString() !== user.companyId) {
    return false;
  }
  return true;
};

// @route   GET /api/leaves
// @desc    Get leave requests
// @access  Private
router.get('/', async (req, res) => {
  try {
    const filter = {};

    if (req.user.role === 'admin') {
      filter.companyId = req.user.companyId;
    } else if (req.user.role !== 'super_admin') {
      filter.userId = req.user.id;
    }

    // Support query params for filters
    if (req.query.status) filter.status = req.query.status;
    if (req.query.userId && (req.user.role === 'admin' || req.user.role === 'super_admin')) filter.userId = req.query.userId;

    const leaves = await Leave.find(filter)
      .populate('userId', 'firstName lastName email')
      .populate('companyId', 'name')
      .populate('departmentId', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      leaves: leaves.map(leave => ({
        id: leave._id,
        user: leave.userId,
        company: leave.companyId,
        department: leave.departmentId,
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        days: leave.days,
        reason: leave.reason,
        emergencyContact: leave.emergencyContact || null,
        status: leave.status,
        rejectionReason: leave.rejectionReason || null,
        approvedBy: leave.approvedBy || null,
        approvedAt: leave.approvedAt || null,
        createdAt: leave.createdAt
      }))
    });

  } catch (error) {
    console.error('Get leaves error:', error);
    res.status(500).json({
      error: 'Failed to get leave requests',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/leaves/hr-management
// @desc    Get all company leave requests except HR's own requests
// @access  Private (HR, Admin, Super Admin)
router.get('/hr-management', requireRole(['hr', 'admin', 'super_admin']), async (req, res) => {
  try {
    const filter = {
      companyId: req.user.companyId,
      userId: { $ne: req.user.id } // Exclude HR's own requests
    };

    // Support query params for filters
    if (req.query.status) filter.status = req.query.status;
    if (req.query.departmentId) filter.departmentId = req.query.departmentId;
    if (req.query.type) filter.type = req.query.type;

    const leaves = await Leave.find(filter)
      .populate('userId', 'firstName lastName email role departmentId')
      .populate('companyId', 'name')
      .populate('departmentId', 'name')
      .sort({ createdAt: -1 });

    console.log(`🔍 HR Management API - Found ${leaves.length} leave requests (excluding HR's own)`);

    res.status(200).json({
      success: true,
      message: 'Company leave requests fetched successfully (excluding HR own requests)',
      data: leaves.map(leave => ({
        id: leave._id,
        user: leave.userId,
        company: leave.companyId,
        department: leave.departmentId,
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        days: leave.days,
        reason: leave.reason,
        emergencyContact: leave.emergencyContact || null,
        status: leave.status,
        rejectionReason: leave.rejectionReason || null,
        approvedBy: leave.approvedBy || null,
        approvedAt: leave.approvedAt || null,
        createdAt: leave.createdAt
      })),
      total: leaves.length,
      filters: {
        companyId: req.user.companyId,
        excludedUserId: req.user.id,
        status: req.query.status || 'all',
        departmentId: req.query.departmentId || 'all',
        type: req.query.type || 'all'
      }
    });

  } catch (error) {
    console.error('HR Management get leaves error:', error);
    res.status(500).json({
      error: 'Failed to get company leave requests',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/leaves
// @desc    Create leave request
// @access  Private
const validateLeaveCreation = [
  body('type').isIn(['sick', 'casual', 'annual', 'maternity', 'paternity', 'unpaid', 'emergency', 'compensatory', 'other']),
  body('startDate').isISO8601(),
  body('endDate').isISO8601(),
  body('reason').notEmpty(),
  body('emergencyContact').optional().isString(),
  body('days').optional().isNumeric(),
  body('userId').optional().isMongoId()
];

router.post('/', validateLeaveCreation, auditMiddleware.leaveRequested, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { type, startDate, endDate, reason, emergencyContact, days: requestedDays, userId: requestedUserId } = req.body;

    // Validate date ordering
    const sDate = new Date(startDate);
    const eDate = new Date(endDate);
    if (sDate > eDate) {
      return res.status(400).json({ error: 'Validation failed', message: 'startDate must be before or equal to endDate' });
    }

    // Compute days server-side if not provided
    let computedDays = 0;
    try {
      const start = new Date(sDate);
      const end = new Date(eDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      computedDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      if (isNaN(computedDays) || computedDays < 0) computedDays = 0;
    } catch (err) {
      computedDays = 0;
    }

    // Determine target user: by default the requester, but admins/super_admins may specify a userId
    let targetUserId = req.user.id;
    if ((req.user.role === 'admin' || req.user.role === 'super_admin') && requestedUserId) {
      targetUserId = requestedUserId;
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    // Admins should not be able to create leaves for users outside their company
    if (req.user.role === 'admin' && user.companyId.toString() !== req.user.companyId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You cannot create a leave request for a user outside your company'
      });
    }

    const leave = new Leave({
      userId: targetUserId,
      companyId: user.companyId,
      departmentId: user.departmentId,
      workspaceId: user.workspaceId,
      roleAtRequest: user.role,
      createdBy: req.user.id,
      type,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      days: parseInt(requestedDays) || computedDays,
      reason,
      emergencyContact: emergencyContact || '',
      status: 'pending',
      audit: []
    });

    // add initial audit entry
    leave.addAuditEntry('created', req.user.id, { via: 'api' });

    await leave.save();

    // Create notification for HR/Manager about new leave request
    try {
      console.log('🔔 Creating leave request notification');

      // Find HR and Manager users in the same company
      const hrAndManagers = await User.find({
        companyId: user.companyId,
        role: { $in: ['hr', 'hr_manager', 'manager', 'admin'] }
      });

      for (const hrOrManager of hrAndManagers) {
        if (hrOrManager._id.toString() !== targetUserId.toString()) {
          const notification = new Notification({
            recipient: hrOrManager._id,
            sender: targetUserId,
            companyId: user.companyId,
            title: `New Leave Request: ${leave.type}`,
            message: `${user.firstName} ${user.lastName} has submitted a ${leave.type} leave request for ${leave.days} days (${new Date(leave.startDate).toLocaleDateString()} - ${new Date(leave.endDate).toLocaleDateString()})`,
            type: 'leave_request',
            priority: leave.type === 'emergency' ? 'high' : 'medium',
            actionUrl: `/leaves/${leave._id}`,
            actionText: 'Review Request',
            data: {
              leaveId: leave._id,
              leaveType: leave.type,
              requesterId: targetUserId,
              requesterName: `${user.firstName} ${user.lastName}`,
              startDate: leave.startDate,
              endDate: leave.endDate,
              days: leave.days,
              reason: leave.reason
            }
          });

          await notification.save();

          // Send real-time notification
          sendNotificationToUser(hrOrManager._id, {
            id: notification._id,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            priority: notification.priority,
            status: notification.status,
            isRead: notification.isRead,
            createdAt: notification.createdAt,
            actionUrl: notification.actionUrl,
            actionText: notification.actionText,
            data: notification.data
          });

          // Update unread count
          const unreadCount = await Notification.getUnreadCount(hrOrManager._id);
          sendUnreadCountUpdate(hrOrManager._id, unreadCount);

          console.log('✅ Leave request notification created and sent for:', hrOrManager.email);
        }
      }
    } catch (notificationError) {
      console.error('❌ Failed to create leave request notifications:', notificationError);
    }

    res.status(201).json({
      success: true,
      message: 'Leave request created successfully',
      leave: {
        id: leave._id,
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        days: leave.days,
        reason: leave.reason,
        status: leave.status,
        createdAt: leave.createdAt
      }
    });

  } catch (error) {
    console.error('Create leave request error:', error);
    res.status(500).json({
      error: 'Failed to create leave request',
      message: 'Internal server error'
    });
  }
});

// @route   PATCH /api/leaves/:id/approve
// @desc    Approve leave request
// @access  Private (HR, Admin, Super Admin)
router.patch('/:id/approve', requireRole(['hr', 'admin', 'super_admin']), auditMiddleware.leaveApproved, async (req, res) => {
  try {
    const leaveId = req.params.id;

    const leave = await Leave.findById(leaveId);
    if (!leave) {
      return res.status(404).json({
        error: 'Leave request not found',
        message: 'Leave request does not exist'
      });
    }


    if (!checkCompanyAccess(req.user, leave)) {
      return res.status(403).json({ error: 'Access denied', message: 'Leave request not found in your company' });
    }

    leave.status = 'approved';
    leave.approvedBy = req.user.id;
    leave.approvedAt = new Date();
    // clear any previous rejection/cancellation reason when approving
    leave.rejectionReason = null;
    leave.addAuditEntry('approved', req.user.id, { note: req.body.note || '' });

    await leave.save();

    // Create notification for the employee about leave approval
    try {
      console.log('🔔 Creating leave approval notification');
      const user = await User.findById(leave.userId);

      if (user) {
        const notification = new Notification({
          recipient: leave.userId,
          sender: req.user.id,
          companyId: leave.companyId,
          title: `Leave Request Approved: ${leave.type}`,
          message: `Your ${leave.type} leave request for ${leave.days} days (${new Date(leave.startDate).toLocaleDateString()} - ${new Date(leave.endDate).toLocaleDateString()}) has been approved.`,
          type: 'leave_approved',
          priority: 'medium',
          actionUrl: `/leaves/${leave._id}`,
          actionText: 'View Details',
          data: {
            leaveId: leave._id,
            leaveType: leave.type,
            startDate: leave.startDate,
            endDate: leave.endDate,
            days: leave.days,
            approvedBy: req.user.id,
            approvedAt: leave.approvedAt
          }
        });

        await notification.save();

        // Send real-time notification
        sendNotificationToUser(leave.userId, {
          id: notification._id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          priority: notification.priority,
          status: notification.status,
          isRead: notification.isRead,
          createdAt: notification.createdAt,
          actionUrl: notification.actionUrl,
          actionText: notification.actionText,
          data: notification.data
        });

        // Update unread count
        const unreadCount = await Notification.getUnreadCount(leave.userId);
        sendUnreadCountUpdate(leave.userId, unreadCount);

        console.log('✅ Leave approval notification created and sent for user:', user.email);
      }
    } catch (notificationError) {
      console.error('❌ Failed to create leave approval notification:', notificationError);
    }

    res.status(200).json({
      success: true,
      message: 'Leave request approved successfully',
      leave: {
        id: leave._id,
        user: leave.userId,
        company: leave.companyId,
        department: leave.departmentId,
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        days: leave.days,
        reason: leave.reason,
        emergencyContact: leave.emergencyContact || null,
        status: leave.status,
        rejectionReason: leave.rejectionReason || null,
        approvedBy: leave.approvedBy || null,
        approvedAt: leave.approvedAt || null,
        createdAt: leave.createdAt
      }
    });

  } catch (error) {
    console.error('Approve leave request error:', error);
    res.status(500).json({
      error: 'Failed to approve leave request',
      message: 'Internal server error'
    });
  }
});

// @route   PATCH /api/leaves/:id/reject
// @desc    Reject leave request
// @access  Private (HR, Admin, Super Admin)
const validateLeaveRejection = [
  body('rejectionReason').notEmpty()
];

router.patch('/:id/reject', requireRole(['hr', 'admin', 'super_admin']), validateLeaveRejection, auditMiddleware.leaveRejected, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: errors.array()[0].msg
      });
    }

    const leaveId = req.params.id;
    const { rejectionReason } = req.body;

    const leave = await Leave.findById(leaveId);
    if (!leave) {
      return res.status(404).json({
        error: 'Leave request not found',
        message: 'Leave request does not exist'
      });
    }


    if (!checkCompanyAccess(req.user, leave)) {
      return res.status(403).json({ error: 'Access denied', message: 'Leave request not found in your company' });
    }

    leave.status = 'rejected';
    leave.approvedBy = req.user.id;
    leave.approvedAt = new Date();
    leave.rejectionReason = rejectionReason;
    leave.addAuditEntry('rejected', req.user.id, { reason: rejectionReason });

    await leave.save();

    // Create notification for the employee about leave rejection
    try {
      console.log('🔔 Creating leave rejection notification');
      const user = await User.findById(leave.userId);

      if (user) {
        const notification = new Notification({
          recipient: leave.userId,
          sender: req.user.id,
          companyId: leave.companyId,
          title: `Leave Request Rejected: ${leave.type}`,
          message: `Your ${leave.type} leave request for ${leave.days} days has been rejected. Reason: ${rejectionReason}`,
          type: 'leave_rejected',
          priority: 'medium',
          actionUrl: `/leaves/${leave._id}`,
          actionText: 'View Details',
          data: {
            leaveId: leave._id,
            leaveType: leave.type,
            startDate: leave.startDate,
            endDate: leave.endDate,
            days: leave.days,
            rejectionReason: rejectionReason,
            rejectedBy: req.user.id,
            rejectedAt: leave.approvedAt
          }
        });

        await notification.save();

        // Send real-time notification
        sendNotificationToUser(leave.userId, {
          id: notification._id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          priority: notification.priority,
          status: notification.status,
          isRead: notification.isRead,
          createdAt: notification.createdAt,
          actionUrl: notification.actionUrl,
          actionText: notification.actionText,
          data: notification.data
        });

        // Update unread count
        const unreadCount = await Notification.getUnreadCount(leave.userId);
        sendUnreadCountUpdate(leave.userId, unreadCount);

        console.log('✅ Leave rejection notification created and sent for user:', user.email);
      }
    } catch (notificationError) {
      console.error('❌ Failed to create leave rejection notification:', notificationError);
    }

    res.status(200).json({
      success: true,
      message: 'Leave request rejected successfully'
    });

  } catch (error) {
    console.error('Reject leave request error:', error);
    res.status(500).json({
      error: 'Failed to reject leave request',
      message: 'Internal server error'
    });
  }
});

// @route   PATCH /api/leaves/:id/cancel
// @desc    Cancel leave request (user or admin)
// @access  Private
router.patch('/:id/cancel', async (req, res) => {
  try {
    const leaveId = req.params.id;
    const { cancellationReason } = req.body;

    const leave = await Leave.findById(leaveId);
    if (!leave) {
      return res.status(404).json({ error: 'Leave request not found', message: 'Leave request does not exist' });
    }

    // Owner, HR, or admin can cancel
    if (['hr', 'admin'].includes(req.user.role) && leave.companyId.toString() !== req.user.companyId) {
      return res.status(403).json({ error: 'Access denied', message: 'Leave request not found in your company' });
    }

    if (String(leave.userId) !== req.user.id && !['hr', 'admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied', message: 'You cannot cancel this leave' });
    }

    leave.status = 'cancelled';
    leave.approvedBy = req.user.id;
    leave.approvedAt = new Date();
    // reuse rejectionReason field to show reason for cancellation in UI
    leave.rejectionReason = cancellationReason || '';
    leave.addAuditEntry('cancelled', req.user.id, { reason: cancellationReason });

    await leave.save();

    res.status(200).json({ success: true, message: 'Leave request cancelled successfully' });
  } catch (error) {
    console.error('Cancel leave request error:', error);
    res.status(500).json({ error: 'Failed to cancel leave request', message: 'Internal server error' });
  }
});

// @route   PUT /api/leaves/:id
// @desc    Update leave request (dates/type/reason/status for admins)
// @access  Private
router.put('/:id', async (req, res) => {
  try {
    const leaveId = req.params.id;
    const { type, startDate, endDate, reason, days, status, rejectionReason } = req.body;

    const leave = await Leave.findById(leaveId);
    if (!leave) {
      return res.status(404).json({ error: 'Leave request not found', message: 'Leave request does not exist' });
    }

    // Authorization: HR, admin can edit any in company; owner can edit own pending
    if (['hr', 'admin'].includes(req.user.role) && leave.companyId.toString() !== req.user.companyId) {
      return res.status(403).json({ error: 'Access denied', message: 'Leave request not found in your company' });
    }

    if (!['hr', 'admin', 'super_admin'].includes(req.user.role)) {
      // owner edits allowed only if pending
      if (String(leave.userId) !== req.user.id) {
        return res.status(403).json({ error: 'Access denied', message: 'You cannot edit this leave' });
      }
      if (leave.status !== 'pending') {
        return res.status(403).json({ error: 'Cannot edit', message: 'Only pending leaves can be edited by owner' });
      }
    }

    // Validate dates ordering if provided
    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      if (s > e) {
        return res.status(400).json({ error: 'Validation failed', message: 'startDate must be before or equal to endDate' });
      }
      leave.startDate = new Date(startDate);
      leave.endDate = new Date(endDate);
      leave.days = parseFloat(days) || leave.calculateDays();
    }

    if (type) leave.type = type;
    if (reason) leave.reason = reason;
    if (typeof status !== 'undefined' && ['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
      leave.status = status;
      if (status === 'approved') {
        leave.approvedBy = req.user.id;
        leave.approvedAt = new Date();
        // Clear any previous rejection/cancellation reason when approving
        leave.rejectionReason = null;
      }
      if (status === 'rejected' || status === 'cancelled') {
        leave.rejectionReason = rejectionReason || leave.rejectionReason;
        leave.approvedBy = req.user.id;
        leave.approvedAt = new Date();
      }
    }

    leave.addAuditEntry('updated', req.user.id, { changes: req.body });
    await leave.save();

    res.status(200).json({ success: true, message: 'Leave updated successfully', leave });
  } catch (error) {
    console.error('Update leave request error:', error);
    res.status(500).json({ error: 'Failed to update leave request', message: 'Internal server error' });
  }
});

// @route   GET /api/leaves/monthly-summary
// @desc    Get monthly leave summary with statistics
// @access  Private
router.get('/monthly-summary', async (req, res) => {
  try {
    const { year, month } = req.query;

    // Default to current month if not provided
    const currentDate = new Date();
    const targetYear = parseInt(year) || currentDate.getFullYear();
    const targetMonth = parseInt(month) || (currentDate.getMonth() + 1); // JS months are 0-indexed

    // Validate month range
    if (targetMonth < 1 || targetMonth > 12) {
      return res.status(400).json({
        error: 'Invalid month',
        message: 'Month must be between 1 and 12'
      });
    }

    // Create date range for the target month
    const monthStart = new Date(targetYear, targetMonth - 1, 1);
    const monthEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999); // Last day of month

    let filter = {
      status: { $in: ['approved', 'pending'] },
      startDate: { $lte: monthEnd },
      endDate: { $gte: monthStart }
    };

    // Apply role-based filtering
    if (req.user.role === 'admin') {
      filter.companyId = req.user.companyId;
    } else if (req.user.role === 'super_admin') {
      // Super admin can see all, no additional filter needed
    } else if (req.user.role === 'hr' || req.user.role === 'hr_manager') {
      filter.companyId = req.user.companyId;
    } else if (req.user.role === 'department_head') {
      filter.departmentId = req.user.departmentId;
    } else if (req.user.role === 'manager') {
      // Manager can see team members' leaves
      const teamMembers = await User.find({
        managerId: req.user.id,
        companyId: req.user.companyId
      }).select('_id');
      const teamMemberIds = teamMembers.map(member => member._id);
      filter.userId = { $in: teamMemberIds };
    } else {
      // Regular members can only see their own leaves
      filter.userId = req.user.id;
    }

    // Fetch approved leaves for the month
    const approvedLeaves = await Leave.find(filter)
      .populate('userId', 'firstName lastName email avatar')
      .populate('departmentId', 'name')
      .populate('companyId', 'name')
      .sort({ startDate: 1 });

    // Calculate summary statistics
    const summary = {
      totalLeaves: approvedLeaves.length,
      totalDays: 0,
      byType: {
        sick: 0,
        casual: 0,
        annual: 0,
        maternity: 0,
        paternity: 0,
        unpaid: 0,
        emergency: 0,
        compensatory: 0,
        other: 0
      },
      byDepartment: {},
      topReasons: {}
    };

    approvedLeaves.forEach(leave => {
      // Count total days
      summary.totalDays += leave.days;

      // Count by leave type
      if (summary.byType[leave.type] !== undefined) {
        summary.byType[leave.type]++;
      }

      // Count by department
      const deptName = leave.departmentId?.name || 'No Department';
      if (!summary.byDepartment[deptName]) {
        summary.byDepartment[deptName] = 0;
      }
      summary.byDepartment[deptName]++;

      // Count top reasons
      const reason = leave.reason || 'No reason provided';
      if (!summary.topReasons[reason]) {
        summary.topReasons[reason] = 0;
      }
      summary.topReasons[reason]++;
    });

    // Sort departments by count (descending)
    const sortedDepartments = Object.entries(summary.byDepartment)
      .sort(([, a], [, b]) => b - a)
      .reduce((acc, [dept, count]) => {
        acc[dept] = count;
        return acc;
      }, {});

    // Sort top reasons by count (descending) and take top 5
    const sortedReasons = Object.entries(summary.topReasons)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .reduce((acc, [reason, count]) => {
        acc[reason] = count;
        return acc;
      }, {});

    // Format leave requests for response
    const formattedLeaves = approvedLeaves.map(leave => ({
      id: leave._id,
      employeeId: leave.userId?._id,
      employeeName: leave.userId ? `${leave.userId.firstName || ''} ${leave.userId.lastName || ''}`.trim() : 'Unknown',
      employeeEmail: leave.userId?.email || '',
      departmentId: leave.departmentId?._id,
      departmentName: leave.departmentId?.name || 'No Department',
      companyId: leave.companyId?._id,
      companyName: leave.companyId?.name || 'Unknown Company',
      leaveType: leave.type,
      startDate: leave.startDate,
      endDate: leave.endDate,
      totalDays: leave.days,
      reason: leave.reason,
      status: leave.status,
      approvedDate: leave.approvedAt,
      createdAt: leave.createdAt
    }));

    res.status(200).json({
      success: true,
      message: `Monthly leave summary for ${new Date(targetYear, targetMonth - 1).toLocaleString('default', { month: 'long' })} ${targetYear}`,
      data: {
        month: targetMonth,
        year: targetYear,
        monthStart: monthStart,
        monthEnd: monthEnd,
        leaves: formattedLeaves,
        summary: {
          ...summary,
          byDepartment: sortedDepartments,
          topReasons: sortedReasons
        }
      },
      meta: {
        total: approvedLeaves.length,
        filters: {
          year: targetYear,
          month: targetMonth,
          status: 'approved',
          userRole: req.user.role,
          companyId: req.user.companyId || null,
          departmentId: req.user.departmentId || null
        }
      }
    });

  } catch (error) {
    console.error('Monthly leave summary error:', error);
    res.status(500).json({
      error: 'Failed to get monthly leave summary',
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/leaves/:id
// @desc    Delete leave request
// @access  Private (Admin, Super Admin, or Owner for pending requests)
router.delete('/:id', async (req, res) => {
  try {
    const leaveId = req.params.id;

    const leave = await Leave.findById(leaveId);
    if (!leave) {
      return res.status(404).json({
        error: 'Leave request not found',
        message: 'Leave request does not exist'
      });
    }

    // Authorization: Admin/Super Admin can delete any in company; Owner can delete own pending requests
    if (['admin', 'super_admin'].includes(req.user.role)) {
      // Admin/Super Admin can delete any leave in their company
      if (req.user.role === 'admin' && leave.companyId.toString() !== req.user.companyId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Leave request not found in your company'
        });
      }
    } else {
      // Regular users can only delete their own pending requests
      if (String(leave.userId) !== req.user.id) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only delete your own leave requests'
        });
      }
      if (leave.status !== 'pending') {
        return res.status(403).json({
          error: 'Cannot delete',
          message: 'Only pending leave requests can be deleted'
        });
      }
    }

    // Add audit entry before deletion
    leave.addAuditEntry('deleted', req.user.id, { deletedBy: req.user.id, deletedAt: new Date() });
    await leave.save();

    // Delete the leave request
    await Leave.findByIdAndDelete(leaveId);

    // Create notification for the employee about leave deletion (if not self-deletion)
    if (String(leave.userId) !== req.user.id) {
      try {
        console.log('🔔 Creating leave deletion notification');
        const user = await User.findById(leave.userId);

        if (user) {
          const notification = new Notification({
            recipient: leave.userId,
            sender: req.user.id,
            companyId: leave.companyId,
            title: `Leave Request Deleted: ${leave.type}`,
            message: `Your ${leave.type} leave request for ${leave.days} days (${new Date(leave.startDate).toLocaleDateString()} - ${new Date(leave.endDate).toLocaleDateString()}) has been deleted.`,
            type: 'leave_deleted',
            priority: 'medium',
            actionUrl: `/leaves`,
            actionText: 'View Leaves',
            data: {
              leaveId: leave._id,
              leaveType: leave.type,
              startDate: leave.startDate,
              endDate: leave.endDate,
              days: leave.days,
              deletedBy: req.user.id,
              deletedAt: new Date()
            }
          });

          await notification.save();
          console.log('✅ Leave deletion notification created for user:', user.email);
        }
      } catch (notificationError) {
        console.error('❌ Failed to create leave deletion notification:', notificationError);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Leave request deleted successfully'
    });

  } catch (error) {
    console.error('Delete leave request error:', error);
    res.status(500).json({
      error: 'Failed to delete leave request',
      message: 'Internal server error'
    });
  }
});

module.exports = router;


