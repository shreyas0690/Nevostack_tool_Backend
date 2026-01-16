const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { Meeting, User, Notification } = require('../models');
const { requireRole, authenticateToken } = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');
const { sendMeetingInvitationEmail } = require('../services/emailService');
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

// Apply HOD panel rate limiter to all meeting routes
router.use(hodPanelLimiter);

// Helper to fetch meetings with population and mapping
async function fetchAndRespondMeetings(filter, res) {
  try {
    const meetings = await Meeting.find(filter)
      .populate('organizer', 'firstName lastName email role')
      .populate('companyId', 'name')
      .populate('departmentId', 'name')
      .populate('departmentIds', 'name')
      .populate('participants.user', 'firstName lastName email role')
      .populate('inviteeUserIds', 'firstName lastName email role')
      .sort({ startTime: 1 });

    console.log('🔍 Backend - Meeting organizer data:', meetings.map(m => ({
      id: m._id,
      organizer: m.organizer,
      organizerRole: m.organizerRole
    })));

    return res.status(200).json({
      success: true,
      data: meetings.map(meeting => ({
        id: meeting._id,
        _id: meeting._id,
        title: meeting.title,
        description: meeting.description,
        organizer: meeting.organizer ? {
          id: meeting.organizer._id,
          _id: meeting.organizer._id,
          name: `${meeting.organizer.firstName || ''} ${meeting.organizer.lastName || ''}`.trim() || meeting.organizer.email,
          firstName: meeting.organizer.firstName,
          lastName: meeting.organizer.lastName,
          email: meeting.organizer.email,
          role: meeting.organizer.role
        } : null,
        organizerRole: meeting.organizer?.role || meeting.organizerRole,
        company: meeting.companyId,
        department: meeting.departmentId,
        departments: meeting.departmentIds,
        participants: meeting.participants,
        inviteeUserIds: meeting.inviteeUserIds,
        inviteeRoles: meeting.inviteeRoles,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        date: meeting.startTime, // For frontend compatibility
        duration: meeting.duration || (meeting.endTime ? Math.round((meeting.endTime - meeting.startTime) / (1000 * 60)) : 60),
        meetingLink: meeting.meetingLink,
        location: meeting.location,
        type: meeting.type,
        status: meeting.status,
        createdAt: meeting.createdAt,
        updatedAt: meeting.updatedAt
      }))
    });
  } catch (err) {
    console.error('fetchAndRespondMeetings error:', err);
    return res.status(500).json({ error: 'Failed to get meetings' });
  }
}

// @route   GET /api/meetings
// @desc    Get meetings for user based on role and permissions
// @access  Private
router.get('/', async (req, res) => {
  try {
    const filter = {};
    const userId = req.user.id;
    const userRole = req.user.role;
    const userDepartmentId = req.user.departmentId;

    console.log('GET /api/meetings - User:', { userId, userRole, userDepartmentId });

    // Admins and HR can see all company meetings; they may optionally filter by departmentId or userId
    const { departmentId: qDepartmentId, userId: qUserId } = req.query || {};
    if (userRole === 'admin' || userRole === 'super_admin' || userRole === 'hr' || userRole === 'hr_manager') {
      filter.companyId = req.user.companyId;
      if (qDepartmentId) {
        // if admin passed a department filter, match either single department or within departmentIds
        filter.$or = [{ departmentId: qDepartmentId }, { departmentIds: qDepartmentId }];
      }
      if (qUserId) {
        // filter by organizer OR invited user
        filter.$or = filter.$or ? filter.$or.concat([{ organizer: qUserId }, { inviteeUserIds: qUserId }]) : [{ organizer: qUserId }, { inviteeUserIds: qUserId }];
      }
    } else {
      // For non-admin users, default visibility rules depend on role
      // HOD and Manager: show meetings they organized or where they are explicitly invited
      // Member: show only meetings where they are explicitly invited
      if (userRole === 'member') {
        filter.$or = [{ inviteeUserIds: userId }];
      } else if (userRole === 'department_head' || userRole === 'manager') {
        // HOD/Manager: show meetings they organized, where they are invited, or meetings for their department
        filter.$or = [{ organizer: userId }, { inviteeUserIds: userId }, { departmentId: userDepartmentId }, { departmentIds: userDepartmentId }];
      } else {
        // Fallback: show organizer or explicit invite
        filter.$or = [{ organizer: userId }, { inviteeUserIds: userId }];
      }
      filter.companyId = req.user.companyId;
    }

    console.log('GET /api/meetings - Filter:', JSON.stringify(filter, null, 2));

    // Use helper to fetch and respond
    return fetchAndRespondMeetings(filter, res);

  } catch (error) {
    console.error('Get meetings error:', error);
    res.status(500).json({
      error: 'Failed to get meetings',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/meetings
// @desc    Create meeting with role-based permissions
// @access  Private
const validateMeetingCreation = [
  body('title').notEmpty().withMessage('Title is required'),
  body('startTime').isISO8601().withMessage('Valid start time is required'),
  body('meetingLink').optional().isURL().withMessage('Meeting link must be a valid URL'),
  body('endTime').optional().isISO8601().withMessage('End time must be valid'),
  body('type').optional().isIn(['physical', 'virtual', 'hybrid']).withMessage('Invalid meeting type'),
  body('participants').optional().isArray().withMessage('Participants must be an array'),
  body('departmentId').optional().isMongoId().withMessage('Invalid department ID'),
  body('departmentIds').optional().isArray().withMessage('Department IDs must be an array'),
  body('departmentIds.*').optional().isMongoId().withMessage('Each department ID must be valid'),
  body('inviteeUserIds').optional().isArray().withMessage('Invitee user IDs must be an array'),
  body('inviteeRoles').optional().isArray().withMessage('Invitee roles must be an array'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority level')
];

router.post('/', validateMeetingCreation, auditMiddleware.meetingCreated, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: errors.array()[0].msg,
        errors: errors.array()
      });
    }

    const {
      title,
      description,
      startTime,
      endTime,
      meetingLink,
      location,
      type = 'physical',
      participants = [],
      departmentId,
      departmentIds = [],
      inviteeUserIds = [],
      inviteeRoles = [],
      priority = 'medium'
    } = req.body;

    const organizerId = req.user.id;
    const organizerRole = req.user.role;

    const user = await User.findById(organizerId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User does not exist'
      });
    }

    // Enhanced permission checks based on MEETING_SYSTEM.md specifications
    if (organizerRole === 'member') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Members cannot create meetings'
      });
    }

    // HR and HR Manager can create meetings for any department in their company
    if (organizerRole === 'hr' || organizerRole === 'hr_manager') {
      // HR can create meetings for any department in their company
      // No additional restrictions needed
    }

    if (organizerRole === 'department_head') {
      // HOD can only create meetings for their own department
      if (departmentId && String(departmentId) !== String(user.departmentId)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'HOD can only create meetings for their own department'
        });
      }
      // Auto-set department if not provided
      if (!departmentId) {
        req.body.departmentId = user.departmentId;
      }
    }

    if (organizerRole === 'manager') {
      // Manager can only invite their managed members
      if (inviteeUserIds.length > 0) {
        const managedIds = (user.managedMemberIds || []).map(id => String(id));
        const invalidInvitees = inviteeUserIds.some(id => !managedIds.includes(String(id)));
        if (invalidInvitees) {
          return res.status(403).json({
            error: 'Access denied',
            message: 'Manager can only invite their team members'
          });
        }
      }
    }

    // Determine final departments to store
    let finalDepartmentId = null;
    let finalDepartmentIds = [];

    if (departmentIds && departmentIds.length > 0) {
      // Multiple departments selected
      finalDepartmentIds = departmentIds.map(String);
    } else if (departmentId) {
      // Single department selected
      finalDepartmentId = departmentId;
    }

    // Use only explicitly selected invitees
    // No automatic department expansion - only invite selected users
    let finalInviteeUserIds = inviteeUserIds.map(String);

    console.log('Selected departments:', { departmentId, departmentIds });
    console.log('Final departments:', { finalDepartmentId, finalDepartmentIds });
    console.log('Selected invitees:', inviteeUserIds);
    console.log('Final invitee user IDs:', finalInviteeUserIds);

    // Create the meeting
    const meeting = new Meeting({
      title,
      description,
      organizer: organizerId,
      organizerRole,
      companyId: user.companyId,
      departmentId: finalDepartmentId || user.departmentId,
      departmentIds: finalDepartmentIds.length > 0 ? finalDepartmentIds : undefined,
      inviteeUserIds: finalInviteeUserIds,
      inviteeRoles,
      // Also populate participants for backward compatibility
      participants: finalInviteeUserIds.map(id => ({ user: id, role: 'required' })),
      startTime: new Date(startTime),
      endTime: endTime ? new Date(endTime) : undefined,
      meetingLink: meetingLink || undefined,
      location,
      type,
      priority,
      status: 'scheduled'
    });

    console.log('💾 Meeting saved successfully:', meeting._id);
    console.log('📋 Meeting details before populate:', {
      title: meeting.title,
      organizerId: organizerId,
      inviteeUserIds: meeting.inviteeUserIds,
      participants: meeting.participants
    });

    await meeting.save();

    // Populate the response
    await meeting.populate([
      { path: 'organizer', select: 'firstName lastName email role' },
      { path: 'companyId', select: 'name' },
      { path: 'departmentId', select: 'name' },
      { path: 'departmentIds', select: 'name' },
      { path: 'inviteeUserIds', select: 'firstName lastName email role' }
    ]);

    console.log('📋 Meeting details after populate:', {
      title: meeting.title,
      organizerId: organizerId,
      inviteeUserIds: meeting.inviteeUserIds,
      participants: meeting.participants
    });

    // Get unique participants from both inviteeUserIds and participants array
    const inviteeIds = meeting.inviteeUserIds || [];
    const participantIds = meeting.participants ? meeting.participants.map(p => p.user).filter(id => id) : [];
    const allParticipants = [...new Set([
      ...inviteeIds.map(id => id.toString()),
      ...participantIds.map(id => id.toString())
    ])].filter(id => id && id !== organizerId.toString());

    // Create notifications for all participants
    try {
      console.log('🔔 Creating meeting notifications for participants');
      console.log('📋 Meeting data:', {
        id: meeting._id,
        title: meeting.title,
        organizerId: organizerId,
        inviteeUserIds: meeting.inviteeUserIds,
        participants: meeting.participants
      });

      console.log('🔍 Raw inviteeIds:', inviteeIds);
      console.log('🔍 Raw participantIds:', participantIds);
      console.log('👥 Meeting participants (unique):', allParticipants);
      console.log('📊 Total participants to notify:', allParticipants.length);

      for (const participantId of allParticipants) {
        try {
          console.log('🔔 Creating notification for participant:', participantId);

          const notification = new Notification({
            recipient: participantId,
            sender: organizerId,
            companyId: req.user.companyId,
            title: `Meeting Scheduled: ${meeting.title}`,
            message: `You have been invited to a meeting: ${meeting.title}. Meeting starts at ${new Date(meeting.startTime).toLocaleString()}`,
            type: 'meeting_scheduled',
            priority: meeting.priority || 'medium',
            actionUrl: `/meetings/${meeting._id}`,
            actionText: 'View Meeting',
            data: {
              meetingId: meeting._id,
              meetingTitle: meeting.title,
              startTime: meeting.startTime,
              endTime: meeting.endTime,
              location: meeting.location,
              meetingLink: meeting.meetingLink
            }
          });

          await notification.save();
          console.log('✅ Meeting notification created for participant:', participantId);

          // Send real-time notification
          try {
            sendNotificationToUser(participantId, {
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

            const unreadCount = await Notification.getUnreadCount(participantId);
            sendUnreadCountUpdate(participantId, unreadCount);
          } catch (wsError) {
            console.error('❌ WebSocket error:', wsError);
          }
        } catch (notificationError) {
          console.error('❌ Failed to create notification for participant:', participantId, notificationError);
        }
      }
    } catch (notificationError) {
      console.error('❌ Failed to create meeting notifications:', notificationError);
      // Don't fail the meeting creation if notification fails
    }

    // Send email invitations to all participants
    try {
      console.log('📧 Sending meeting invitation emails to participants');

      // Get company name for emails
      const company = await User.findById(req.user.id).populate('companyId', 'name');
      const companyName = company?.companyId?.name || 'NevoStack';

      // Get organizer details
      const organizer = await User.findById(organizerId).select('firstName lastName email role');
      if (!organizer) {
        console.error('❌ Organizer not found for email sending');
      } else {
        // Get department name if available
        let departmentName = null;
        if (meeting.departmentId) {
          const Department = require('../models/Department');
          const dept = await Department.findById(meeting.departmentId).select('name');
          departmentName = dept?.name;
        }

        // Prepare meeting data for email
        // Handle location properly - extract meaningful string or omit if empty
        let locationString = null;
        if (meeting.location) {
          if (typeof meeting.location === 'string' && meeting.location.trim()) {
            locationString = meeting.location.trim();
          } else if (typeof meeting.location === 'object') {
            // If it's an object, try to extract location info
            const locationObj = meeting.location;
            if (locationObj.physical && typeof locationObj.physical === 'string' && locationObj.physical.trim()) {
              locationString = locationObj.physical.trim();
            } else if (locationObj.virtual && typeof locationObj.virtual === 'string' && locationObj.virtual.trim()) {
              locationString = locationObj.virtual.trim();
            }
            // If object is empty or doesn't contain meaningful strings, locationString remains null
          }
        }

        const meetingDataForEmail = {
          title: meeting.title,
          description: meeting.description,
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          location: locationString, // Use the processed location string
          meetingLink: meeting.meetingLink,
          type: meeting.type,
          priority: meeting.priority,
          departmentName: departmentName
        };

        // Send email to each participant
        for (const participantId of allParticipants) {
          try {
            const participant = await User.findById(participantId).select('firstName lastName email');
            if (participant && participant.email) {
              console.log('📧 Sending meeting invitation email to:', participant.email);

              const emailResult = await sendMeetingInvitationEmail(
                participant.email,
                `${participant.firstName} ${participant.lastName}`,
                meetingDataForEmail,
                {
                  firstName: organizer.firstName,
                  lastName: organizer.lastName,
                  role: organizerRole,
                  email: organizer.email
                },
                companyName
              );

              if (emailResult.success) {
                console.log('✅ Meeting invitation email sent to:', participant.email);
              } else {
                console.log('⚠️ Meeting invitation email failed to send to:', participant.email, emailResult.error);
              }
            } else {
              console.log('⚠️ Participant not found or no email for ID:', participantId);
            }
          } catch (emailError) {
            console.error('❌ Failed to send meeting invitation email to participant:', participantId, emailError);
          }
        }
      }
    } catch (emailError) {
      console.error('❌ Failed to send meeting invitation emails:', emailError);
      // Don't fail the meeting creation if email sending fails
    }

    res.status(201).json({
      success: true,
      message: 'Meeting created successfully',
      data: {
        id: meeting._id,
        _id: meeting._id,
        title: meeting.title,
        description: meeting.description,
        organizer: meeting.organizer,
        organizerRole: meeting.organizerRole,
        company: meeting.companyId,
        department: meeting.departmentId,
        departments: meeting.departmentIds,
        inviteeUserIds: meeting.inviteeUserIds,
        inviteeRoles: meeting.inviteeRoles,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        date: meeting.startTime, // For frontend compatibility
        duration: meeting.duration || (meeting.endTime ? Math.round((meeting.endTime - meeting.startTime) / (1000 * 60)) : 60),
        meetingLink: meeting.meetingLink,
        location: meeting.location,
        type: meeting.type,
        status: meeting.status,
        createdAt: meeting.createdAt,
        updatedAt: meeting.updatedAt
      }
    });

  } catch (error) {
    console.error('Create meeting error:', error);
    res.status(500).json({
      error: 'Failed to create meeting',
      message: 'Internal server error'
    });
  }
});

// @route   PATCH /api/meetings/:id/status
// @desc    Update meeting status
// @access  Private (Organizer or Admin)
router.patch('/:id/status', [
  body('status').isIn(['scheduled', 'in_progress', 'completed', 'cancelled'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: errors.array()[0].msg
      });
    }

    const meetingId = req.params.id;
    const { status } = req.body;

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({
        error: 'Meeting not found',
        message: 'Meeting does not exist'
      });
    }

    // Check if user has permission to update this meeting
    const currentUserId = req.user?.id;
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' &&
      req.user.role !== 'hr' && req.user.role !== 'hr_manager' &&
      meeting.organizer.toString() !== currentUserId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update meetings you organized'
      });
    }

    meeting.status = status;
    await meeting.save();

    // Create notification if meeting is cancelled
    if (status === 'cancelled') {
      try {
        console.log('🔔 Creating meeting cancellation notifications');

        // Get unique participants from both inviteeUserIds and participants array
        const inviteeIds = meeting.inviteeUserIds || [];
        const participantIds = meeting.participants ? meeting.participants.map(p => p.user).filter(id => id) : [];

        // Combine and remove duplicates
        const allParticipants = [...new Set([
          ...inviteeIds.map(id => id.toString()),
          ...participantIds.map(id => id.toString())
        ])].filter(id => id && id !== req.user.id.toString());

        console.log('👥 Meeting participants to notify about cancellation:', allParticipants);
        console.log('📊 Total participants to notify:', allParticipants.length);

        for (const participantId of allParticipants) {
          const notification = new Notification({
            recipient: participantId,
            sender: req.user.id,
            companyId: req.user.companyId,
            title: `Meeting Cancelled: ${meeting.title}`,
            message: `The meeting "${meeting.title}" has been cancelled.`,
            type: 'meeting_cancelled',
            priority: 'medium',
            actionUrl: `/meetings/${meeting._id}`,
            actionText: 'View Details',
            data: {
              meetingId: meeting._id,
              meetingTitle: meeting.title,
              originalStartTime: meeting.startTime,
              cancelledBy: req.user.id
            }
          });

          await notification.save();
          console.log('✅ Meeting cancellation notification created for participant:', participantId);

          // Send real-time notification
          try {
            sendNotificationToUser(participantId, {
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

            const unreadCount = await Notification.getUnreadCount(participantId);
            sendUnreadCountUpdate(participantId, unreadCount);
          } catch (wsError) {
            console.error('❌ WebSocket error:', wsError);
          }
        }
      } catch (notificationError) {
        console.error('❌ Failed to create meeting cancellation notifications:', notificationError);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Meeting status updated successfully'
    });

  } catch (error) {
    console.error('Update meeting status error:', error);
    res.status(500).json({
      error: 'Failed to update meeting status',
      message: 'Internal server error'
    });
  }
});

// Update meeting
router.put('/:id', [
  body('title').optional().isLength({ min: 1 }).withMessage('Title is required'),
  body('description').optional().isString(),
  body('startTime').optional().isISO8601().withMessage('Start time must be a valid date'),
  body('endTime').optional().isISO8601().withMessage('End time must be a valid date'),
  body('type').optional().isIn(['physical', 'virtual', 'hybrid']).withMessage('Invalid meeting type'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority'),
  body('location').optional().isString(),
  body('meetingLink').optional().isURL().withMessage('Meeting link must be a valid URL'),
  body('status').optional().isIn(['scheduled', 'in_progress', 'completed', 'cancelled']).withMessage('Invalid status')
], async (req, res) => {
  try {
    console.log('🚀 Update Meeting API called');
    console.log('🔍 Meeting ID:', req.params.id);
    console.log('🔍 Update data:', req.body);

    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const meetingId = req.params.id;
    const updateData = req.body;

    // Find the meeting
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found',
        message: 'The requested meeting does not exist'
      });
    }

    // Check if user has permission to update this meeting
    const currentUserId = req.user?.id;
    if (meeting.organizer.toString() !== currentUserId &&
      req.user?.role !== 'admin' && req.user?.role !== 'super_admin' &&
      req.user?.role !== 'hr' && req.user?.role !== 'hr_manager') {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'You can only update meetings you organized'
      });
    }

    // Prepare update object
    const updateFields = {};

    if (updateData.title) updateFields.title = updateData.title;
    if (updateData.description !== undefined) updateFields.description = updateData.description;
    if (updateData.startTime) updateFields.startTime = new Date(updateData.startTime);
    if (updateData.endTime) updateFields.endTime = new Date(updateData.endTime);
    if (updateData.type) updateFields.type = updateData.type;
    if (updateData.priority) updateFields.priority = updateData.priority;
    if (updateData.location !== undefined) updateFields.location = updateData.location;
    if (updateData.meetingLink !== undefined) updateFields.meetingLink = updateData.meetingLink;
    if (updateData.status) updateFields.status = updateData.status;

    // Update participants if provided
    if (updateData.participants) {
      updateFields.participants = updateData.participants;
    }

    // Update inviteeUserIds if provided
    if (updateData.inviteeUserIds) {
      updateFields.inviteeUserIds = updateData.inviteeUserIds.map(String);
      // Also update participants for backward compatibility
      updateFields.participants = updateData.inviteeUserIds.map(id => ({ user: id, role: 'required' }));
    }

    // Update departments if provided
    if (updateData.departmentId) {
      updateFields.departmentId = updateData.departmentId;
    }
    if (updateData.departmentIds) {
      updateFields.departmentIds = updateData.departmentIds;
    }

    // Add updated timestamp
    updateFields.updatedAt = new Date();

    // Update the meeting
    const updatedMeeting = await Meeting.findByIdAndUpdate(
      meetingId,
      updateFields,
      { new: true, runValidators: true }
    ).populate('organizer', 'firstName lastName email role')
      .populate('companyId', 'name')
      .populate('departmentId', 'name')
      .populate('participants.user', 'firstName lastName email role')
      .populate('inviteeUserIds', 'firstName lastName email role');

    console.log('✅ Meeting updated successfully:', updatedMeeting._id);

    res.json({
      success: true,
      data: {
        id: updatedMeeting._id,
        _id: updatedMeeting._id,
        title: updatedMeeting.title,
        description: updatedMeeting.description,
        organizer: updatedMeeting.organizer,
        organizerRole: updatedMeeting.organizerRole,
        company: updatedMeeting.companyId,
        department: updatedMeeting.departmentId,
        departments: updatedMeeting.departmentIds,
        inviteeUserIds: updatedMeeting.inviteeUserIds,
        inviteeRoles: updatedMeeting.inviteeRoles,
        startTime: updatedMeeting.startTime,
        endTime: updatedMeeting.endTime,
        date: updatedMeeting.startTime, // For frontend compatibility
        duration: updatedMeeting.duration || (updatedMeeting.endTime ? Math.round((updatedMeeting.endTime - updatedMeeting.startTime) / (1000 * 60)) : 60),
        meetingLink: updatedMeeting.meetingLink,
        location: updatedMeeting.location,
        type: updatedMeeting.type,
        status: updatedMeeting.status,
        createdAt: updatedMeeting.createdAt,
        updatedAt: updatedMeeting.updatedAt
      },
      message: 'Meeting updated successfully'
    });

  } catch (error) {
    console.error('❌ Update meeting error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update meeting',
      message: error.message
    });
  }
});

// @route   DELETE /api/meetings/:id
// @desc    Delete meeting
// @access  Private (Organizer or Admin)
router.delete('/:id', async (req, res) => {
  try {
    console.log('🗑️ Delete Meeting API called');
    console.log('🔍 Meeting ID:', req.params.id);

    const meetingId = req.params.id;

    // Find the meeting
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found',
        message: 'The requested meeting does not exist'
      });
    }

    // Check if user has permission to delete this meeting
    const currentUserId = req.user?.id;
    if (meeting.organizer.toString() !== currentUserId &&
      req.user?.role !== 'admin' && req.user?.role !== 'super_admin' &&
      req.user?.role !== 'hr' && req.user?.role !== 'hr_manager') {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'You can only delete meetings you organized'
      });
    }

    // Delete the meeting
    await Meeting.findByIdAndDelete(meetingId);

    console.log('✅ Meeting deleted successfully:', meetingId);

    res.json({
      success: true,
      message: 'Meeting deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete meeting error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete meeting',
      message: error.message
    });
  }
});

module.exports = router;











