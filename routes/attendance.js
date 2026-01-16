const express = require('express');
const { body, validationResult } = require('express-validator');
const { Attendance, User } = require('../models');
const { requireRole, requireCompanyAccess } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/attendance
// @desc    Get attendance records (with pagination and filters)
// @access  Private
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      userId = '',
      date = '',
      status = '',
      companyId = '',
      departmentId = '',
      startDate = '',
      endDate = '',
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    // Build filter query
    const filter = {};

    // Company filter (for company admins)
    if (req.user.role === 'admin') {
      filter.companyId = req.user.companyId;
    } else if (companyId) {
      filter.companyId = companyId;
    }

    // User filter (for regular users, they can only see their own attendance)
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      filter.userId = req.user.id;
    } else if (userId) {
      filter.userId = userId;
    }

    // Department filter
    if (departmentId) {
      filter.departmentId = departmentId;
    }

    // Date filter
    if (date) {
      const targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      filter.date = { $gte: targetDate, $lt: nextDate };
    }

    // Date range filter
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Get attendance records with pagination
    const attendanceRecords = await Attendance.find(filter)
      .populate('userId', 'firstName lastName email avatar')
      .populate('companyId', 'name domain')
      .populate('departmentId', 'name')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Attendance.countDocuments(filter);

    // Transform attendance records for response
    const transformedRecords = attendanceRecords.map(record => ({
      id: record._id,
      user: record.userId,
      company: record.companyId,
      department: record.departmentId,
      date: record.date,
      checkIn: record.checkIn,
      checkOut: record.checkOut,
      status: record.status,
      totalHours: record.totalHours,
      overtime: record.overtime,
      notes: record.notes,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }));

    res.status(200).json({
      success: true,
      attendance: transformedRecords,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({
      error: 'Failed to get attendance records',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/attendance/:id
// @desc    Get attendance record by ID
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const attendanceId = req.params.id;
    const requestingUser = req.user;

    const attendance = await Attendance.findById(attendanceId)
      .populate('userId', 'firstName lastName email avatar')
      .populate('companyId', 'name domain')
      .populate('departmentId', 'name');

    if (!attendance) {
      return res.status(404).json({
        error: 'Attendance record not found',
        message: 'Attendance record does not exist'
      });
    }

    // Check if user can access this record
    if (requestingUser.role !== 'admin' && 
        requestingUser.role !== 'super_admin' && 
        requestingUser.id !== attendance.userId.toString()) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own attendance records'
      });
    }

    // For company admins, ensure record belongs to their company
    if (requestingUser.role === 'admin' && 
        attendance.companyId.toString() !== requestingUser.companyId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Attendance record not found in your company'
      });
    }

    res.status(200).json({
      success: true,
      attendance: {
        id: attendance._id,
        user: attendance.userId,
        company: attendance.companyId,
        department: attendance.departmentId,
        date: attendance.date,
        checkIn: attendance.checkIn,
        checkOut: attendance.checkOut,
        status: attendance.status,
        totalHours: attendance.totalHours,
        overtime: attendance.overtime,
        notes: attendance.notes,
        createdAt: attendance.createdAt,
        updatedAt: attendance.updatedAt
      }
    });

  } catch (error) {
    console.error('Get attendance record error:', error);
    res.status(500).json({
      error: 'Failed to get attendance record',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/attendance/check-in
// @desc    Check in for attendance
// @access  Private
router.post('/check-in', [
  body('notes').optional().isString().withMessage('Notes must be a string')
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

    const { notes } = req.body;
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already checked in today
    const existingRecord = await Attendance.findOne({
      userId,
      date: { $gte: today, $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) }
    });

    if (existingRecord) {
      return res.status(400).json({
        error: 'Already checked in',
        message: 'You have already checked in today'
      });
    }

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    // Create attendance record
    const attendance = new Attendance({
      userId,
      companyId: user.companyId,
      departmentId: user.departmentId,
      date: new Date(),
      checkIn: new Date(),
      status: 'present',
      notes: notes || ''
    });

    await attendance.save();

    // Populate user and company details
    await attendance.populate('userId', 'firstName lastName email avatar');
    await attendance.populate('companyId', 'name domain');
    await attendance.populate('departmentId', 'name');

    res.status(201).json({
      success: true,
      message: 'Check-in successful',
      attendance: {
        id: attendance._id,
        user: attendance.userId,
        company: attendance.companyId,
        department: attendance.departmentId,
        date: attendance.date,
        checkIn: attendance.checkIn,
        status: attendance.status,
        notes: attendance.notes,
        createdAt: attendance.createdAt
      }
    });

  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({
      error: 'Check-in failed',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/attendance/check-out
// @desc    Check out for attendance
// @access  Private
router.post('/check-out', [
  body('notes').optional().isString().withMessage('Notes must be a string')
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

    const { notes } = req.body;
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find today's attendance record
    const attendance = await Attendance.findOne({
      userId,
      date: { $gte: today, $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) }
    });

    if (!attendance) {
      return res.status(400).json({
        error: 'No check-in record found',
        message: 'You must check in before checking out'
      });
    }

    if (attendance.checkOut) {
      return res.status(400).json({
        error: 'Already checked out',
        message: 'You have already checked out today'
      });
    }

    // Calculate total hours and overtime
    const checkOut = new Date();
    const totalHours = (checkOut - attendance.checkIn) / (1000 * 60 * 60); // hours
    const standardHours = 8; // 8 hours work day
    const overtime = Math.max(0, totalHours - standardHours);

    // Update attendance record
    attendance.checkOut = checkOut;
    attendance.totalHours = Math.round(totalHours * 100) / 100; // Round to 2 decimal places
    attendance.overtime = Math.round(overtime * 100) / 100;
    if (notes) {
      attendance.notes = notes;
    }

    await attendance.save();

    // Populate user and company details
    await attendance.populate('userId', 'firstName lastName email avatar');
    await attendance.populate('companyId', 'name domain');
    await attendance.populate('departmentId', 'name');

    res.status(200).json({
      success: true,
      message: 'Check-out successful',
      attendance: {
        id: attendance._id,
        user: attendance.userId,
        company: attendance.companyId,
        department: attendance.departmentId,
        date: attendance.date,
        checkIn: attendance.checkIn,
        checkOut: attendance.checkOut,
        status: attendance.status,
        totalHours: attendance.totalHours,
        overtime: attendance.overtime,
        notes: attendance.notes,
        updatedAt: attendance.updatedAt
      }
    });

  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({
      error: 'Check-out failed',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/attendance
// @desc    Create attendance record (Admin only)
// @access  Private (Admin, Super Admin)
router.post('/', [
  requireRole(['admin', 'super_admin']),
  body('userId').isMongoId().withMessage('Valid user ID is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('checkIn').optional().isISO8601().withMessage('Valid check-in time is required'),
  body('checkOut').optional().isISO8601().withMessage('Valid check-out time is required'),
  body('status').isIn(['present', 'absent', 'late', 'half-day', 'leave']).withMessage('Invalid status'),
  body('notes').optional().isString().withMessage('Notes must be a string')
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
      userId,
      date,
      checkIn,
      checkOut,
      status,
      notes = ''
    } = req.body;

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    // For company admins, ensure user belongs to their company
    if (req.user.role === 'admin' && 
        user.companyId.toString() !== req.user.companyId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'User not found in your company'
      });
    }

    // Check if attendance record already exists for this date
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const existingRecord = await Attendance.findOne({
      userId,
      date: { $gte: targetDate, $lt: nextDate }
    });

    if (existingRecord) {
      return res.status(400).json({
        error: 'Attendance record already exists',
        message: 'An attendance record already exists for this date'
      });
    }

    // Calculate total hours and overtime if both check-in and check-out are provided
    let totalHours = 0;
    let overtime = 0;

    if (checkIn && checkOut) {
      totalHours = (new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60);
      const standardHours = 8;
      overtime = Math.max(0, totalHours - standardHours);
      totalHours = Math.round(totalHours * 100) / 100;
      overtime = Math.round(overtime * 100) / 100;
    }

    // Create attendance record
    const attendance = new Attendance({
      userId,
      companyId: user.companyId,
      departmentId: user.departmentId,
      date: targetDate,
      checkIn: checkIn ? new Date(checkIn) : null,
      checkOut: checkOut ? new Date(checkOut) : null,
      status,
      totalHours,
      overtime,
      notes
    });

    await attendance.save();

    // Populate user and company details
    await attendance.populate('userId', 'firstName lastName email avatar');
    await attendance.populate('companyId', 'name domain');
    await attendance.populate('departmentId', 'name');

    res.status(201).json({
      success: true,
      message: 'Attendance record created successfully',
      attendance: {
        id: attendance._id,
        user: attendance.userId,
        company: attendance.companyId,
        department: attendance.departmentId,
        date: attendance.date,
        checkIn: attendance.checkIn,
        checkOut: attendance.checkOut,
        status: attendance.status,
        totalHours: attendance.totalHours,
        overtime: attendance.overtime,
        notes: attendance.notes,
        createdAt: attendance.createdAt
      }
    });

  } catch (error) {
    console.error('Create attendance error:', error);
    res.status(500).json({
      error: 'Failed to create attendance record',
      message: 'Internal server error'
    });
  }
});

// @route   PUT /api/attendance/:id
// @desc    Update attendance record
// @access  Private (Admin, Super Admin)
router.put('/:id', [
  requireRole(['admin', 'super_admin']),
  body('date').optional().isISO8601().withMessage('Valid date is required'),
  body('checkIn').optional().isISO8601().withMessage('Valid check-in time is required'),
  body('checkOut').optional().isISO8601().withMessage('Valid check-out time is required'),
  body('status').optional().isIn(['present', 'absent', 'late', 'half-day', 'leave']).withMessage('Invalid status'),
  body('notes').optional().isString().withMessage('Notes must be a string')
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

    const attendanceId = req.params.id;
    const updateData = req.body;

    const attendance = await Attendance.findById(attendanceId);
    if (!attendance) {
      return res.status(404).json({
        error: 'Attendance record not found',
        message: 'Attendance record does not exist'
      });
    }

    // For company admins, ensure record belongs to their company
    if (req.user.role === 'admin' && 
        attendance.companyId.toString() !== req.user.companyId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Attendance record not found in your company'
      });
    }

    // Calculate total hours and overtime if both check-in and check-out are provided
    if (updateData.checkIn && updateData.checkOut) {
      const totalHours = (new Date(updateData.checkOut) - new Date(updateData.checkIn)) / (1000 * 60 * 60);
      const standardHours = 8;
      const overtime = Math.max(0, totalHours - standardHours);
      updateData.totalHours = Math.round(totalHours * 100) / 100;
      updateData.overtime = Math.round(overtime * 100) / 100;
    }

    // Update attendance record
    const updatedAttendance = await Attendance.findByIdAndUpdate(
      attendanceId,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('userId', 'firstName lastName email avatar')
    .populate('companyId', 'name domain')
    .populate('departmentId', 'name');

    res.status(200).json({
      success: true,
      message: 'Attendance record updated successfully',
      attendance: {
        id: updatedAttendance._id,
        user: updatedAttendance.userId,
        company: updatedAttendance.companyId,
        department: updatedAttendance.departmentId,
        date: updatedAttendance.date,
        checkIn: updatedAttendance.checkIn,
        checkOut: updatedAttendance.checkOut,
        status: updatedAttendance.status,
        totalHours: updatedAttendance.totalHours,
        overtime: updatedAttendance.overtime,
        notes: updatedAttendance.notes,
        updatedAt: updatedAttendance.updatedAt
      }
    });

  } catch (error) {
    console.error('Update attendance error:', error);
    res.status(500).json({
      error: 'Failed to update attendance record',
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/attendance/:id
// @desc    Delete attendance record
// @access  Private (Admin, Super Admin)
router.delete('/:id', requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const attendanceId = req.params.id;

    const attendance = await Attendance.findById(attendanceId);
    if (!attendance) {
      return res.status(404).json({
        error: 'Attendance record not found',
        message: 'Attendance record does not exist'
      });
    }

    // For company admins, ensure record belongs to their company
    if (req.user.role === 'admin' && 
        attendance.companyId.toString() !== req.user.companyId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Attendance record not found in your company'
      });
    }

    // Delete attendance record
    await Attendance.findByIdAndDelete(attendanceId);

    res.status(200).json({
      success: true,
      message: 'Attendance record deleted successfully'
    });

  } catch (error) {
    console.error('Delete attendance error:', error);
    res.status(500).json({
      error: 'Failed to delete attendance record',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/attendance/stats
// @desc    Get attendance statistics
// @access  Private (Admin, Super Admin)
router.get('/stats', requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { companyId, departmentId, startDate, endDate } = req.query;
    const requestingUser = req.user;

    // Build filter query
    const filter = {};

    // Company filter (for company admins)
    if (requestingUser.role === 'admin') {
      filter.companyId = requestingUser.companyId;
    } else if (companyId) {
      filter.companyId = companyId;
    }

    // Department filter
    if (departmentId) {
      filter.departmentId = departmentId;
    }

    // Date range filter
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }

    // Get attendance statistics
    const totalRecords = await Attendance.countDocuments(filter);
    const presentRecords = await Attendance.countDocuments({ ...filter, status: 'present' });
    const absentRecords = await Attendance.countDocuments({ ...filter, status: 'absent' });
    const lateRecords = await Attendance.countDocuments({ ...filter, status: 'late' });
    const halfDayRecords = await Attendance.countDocuments({ ...filter, status: 'half-day' });
    const leaveRecords = await Attendance.countDocuments({ ...filter, status: 'leave' });

    // Get total hours and overtime
    const hoursStats = await Attendance.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalHours: { $sum: '$totalHours' },
          totalOvertime: { $sum: '$overtime' },
          avgHours: { $avg: '$totalHours' }
        }
      }
    ]);

    // Get attendance by date (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const attendanceByDate = await Attendance.aggregate([
      { 
        $match: { 
          ...filter, 
          date: { $gte: thirtyDaysAgo } 
        } 
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
          total: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      success: true,
      stats: {
        total: totalRecords,
        present: presentRecords,
        absent: absentRecords,
        late: lateRecords,
        halfDay: halfDayRecords,
        leave: leaveRecords,
        attendanceRate: totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 0,
        hours: hoursStats[0] || { totalHours: 0, totalOvertime: 0, avgHours: 0 },
        byDate: attendanceByDate
      }
    });

  } catch (error) {
    console.error('Get attendance stats error:', error);
    res.status(500).json({
      error: 'Failed to get attendance statistics',
      message: 'Internal server error'
    });
  }
});

module.exports = router;











