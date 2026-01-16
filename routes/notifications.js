const express = require('express');
const { body, validationResult } = require('express-validator');
const { Notification, User, Company } = require('../models');
const { requireRole } = require('../middleware/auth');
const { sendNotificationToUser, sendUnreadCountUpdate } = require('../websocket');

const router = express.Router();

// Test endpoint for debugging
router.post('/test', async (req, res) => {
  try {
    console.log('🔔 Test notification endpoint called');
    console.log('👤 User:', req.user);

    const testNotification = new Notification({
      recipient: req.user.id,
      sender: req.user.id,
      companyId: req.user.companyId,
      title: 'Test Notification',
      message: 'This is a test notification from the system',
      type: 'system_notification',
      priority: 'medium'
    });

    await testNotification.save();
    console.log('✅ Test notification saved:', testNotification._id);

    // Send real-time notification via WebSocket
    try {
      sendNotificationToUser(req.user.id, {
        id: testNotification._id,
        title: testNotification.title,
        message: testNotification.message,
        type: testNotification.type,
        priority: testNotification.priority,
        isRead: testNotification.isRead,
        createdAt: testNotification.createdAt
      });

      // Send unread count update
      const unreadCount = await Notification.getUnreadCount(req.user.id);
      sendUnreadCountUpdate(req.user.id, unreadCount);

      console.log('📤 Real-time notification sent to user:', req.user.id);
    } catch (wsError) {
      console.error('❌ WebSocket error:', wsError);
    }

    res.status(201).json({
      success: true,
      message: 'Test notification created successfully',
      data: testNotification
    });

  } catch (error) {
    console.error('❌ Test notification error:', error);
    res.status(500).json({
      error: 'Failed to create test notification',
      message: error.message
    });
  }
});

// @route   GET /api/notifications
// @desc    Get notifications with advanced filtering
// @access  Private
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      unreadOnly = false,
      type = null,
      priority = null,
      startDate = null,
      endDate = null
    } = req.query;

    const filter = {
      recipient: req.user.id,
      companyId: req.user.companyId
    };

    // Add filters
    if (unreadOnly === 'true') {
      filter.isRead = false;
    }

    if (type) {
      filter.type = type;
    }

    if (priority) {
      filter.priority = priority;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const notifications = await Notification.find(filter)
      .populate('sender', 'firstName lastName email avatar')
      .populate('recipient', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(filter);
    const unreadCount = await Notification.getUnreadCount(req.user.id);

    console.log('📋 Sending notifications response:');
    console.log('📊 Total notifications:', notifications.length);
    console.log('🔔 Unread count:', unreadCount);

    res.status(200).json({
      success: true,
      data: {
        notifications: notifications.map(notification => ({
          _id: notification._id,
          id: notification._id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          priority: notification.priority,
          status: notification.status,
          isRead: notification.isRead,
          readAt: notification.readAt,
          createdAt: notification.createdAt,
          timeAgo: notification.timeAgo,
          sender: notification.sender,
          actionUrl: notification.actionUrl,
          actionText: notification.actionText,
          data: notification.data
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        },
        unreadCount
      }
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      error: 'Failed to get notifications',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/notifications
// @desc    Create notification
// @access  Private
router.post('/', [
  body('recipient').isMongoId().withMessage('Valid recipient ID is required'),
  body('title').notEmpty().withMessage('Title is required'),
  body('message').notEmpty().withMessage('Message is required'),
  body('type').isIn([
    'task_assigned', 'task_updated', 'task_completed', 'task_overdue',
    'meeting_scheduled', 'meeting_reminder', 'meeting_cancelled',
    'leave_request', 'leave_approved', 'leave_rejected',
    'attendance_reminder', 'system_notification', 'announcement',
    'birthday_reminder', 'work_anniversary', 'holiday_reminder',
    'policy_update', 'other'
  ]).withMessage('Invalid notification type'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('actionUrl').optional().isURL(),
  body('actionText').optional().isString(),
  body('channels').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: errors.array()[0].msg
      });
    }

    const {
      recipient,
      title,
      message,
      type,
      priority = 'medium',
      actionUrl,
      actionText = 'View',
      channels = { inApp: { enabled: true } },
      data = {},
      expiresAt
    } = req.body;

    const notification = new Notification({
      recipient,
      sender: req.user.id,
      companyId: req.user.companyId,
      title,
      message,
      type,
      priority,
      actionUrl,
      actionText,
      channels,
      data,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined
    });

    await notification.save();

    // Send real-time notification via WebSocket
    try {
      sendNotificationToUser(recipient, {
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

      // Send unread count update
      const unreadCount = await Notification.getUnreadCount(recipient);
      sendUnreadCountUpdate(recipient, unreadCount);

      console.log('📤 Real-time notification sent to user:', recipient);
    } catch (wsError) {
      console.error('❌ WebSocket error:', wsError);
    }

    res.status(201).json({
      success: true,
      message: 'Notification sent successfully',
      data: {
        id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        priority: notification.priority,
        status: notification.status,
        createdAt: notification.createdAt
      }
    });

  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({
      error: 'Failed to send notification',
      message: 'Internal server error'
    });
  }
});

// @route   PATCH /api/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.patch('/:id/read', async (req, res) => {
  try {
    const notificationId = req.params.id;

    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return res.status(404).json({
        error: 'Notification not found',
        message: 'Notification does not exist'
      });
    }

    if (notification.recipient.toString() !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only mark your own notifications as read'
      });
    }

    await notification.markAsRead();

    // Send unread count update via WebSocket
    try {
      const unreadCount = await Notification.getUnreadCount(req.user.id);
      sendUnreadCountUpdate(req.user.id, unreadCount);
      console.log('📤 Unread count update sent to user:', req.user.id);
    } catch (wsError) {
      console.error('❌ WebSocket error:', wsError);
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: {
        id: notification._id,
        isRead: notification.isRead,
        readAt: notification.readAt
      }
    });

  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({
      error: 'Failed to mark notification as read',
      message: 'Internal server error'
    });
  }
});

// @route   PATCH /api/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.patch('/read-all', async (req, res) => {
  try {
    const result = await Notification.markAllAsReadForUser(req.user.id);

    // Send unread count update via WebSocket
    try {
      // Should be 0 after marking all as read
      sendUnreadCountUpdate(req.user.id, 0);
      console.log('📤 Unread count update (0) sent to user:', req.user.id);
    } catch (wsError) {
      console.error('❌ WebSocket error:', wsError);
    }

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      data: {
        modifiedCount: result.modifiedCount
      }
    });

  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({
      error: 'Failed to mark notifications as read',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/notifications/unread-count
// @desc    Get unread notification count
// @access  Private
router.get('/unread-count', async (req, res) => {
  try {
    const unreadCount = await Notification.getUnreadCount(req.user.id);

    res.status(200).json({
      success: true,
      data: {
        unreadCount
      }
    });

  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      error: 'Failed to get unread count',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/notifications/bulk
// @desc    Create bulk notifications
// @access  Private (Admin/HR only)
router.post('/bulk', requireRole(['admin', 'hr', 'hr_manager']), [
  body('notifications').isArray().withMessage('Notifications must be an array'),
  body('notifications.*.recipient').isMongoId().withMessage('Valid recipient ID is required'),
  body('notifications.*.title').notEmpty().withMessage('Title is required'),
  body('notifications.*.message').notEmpty().withMessage('Message is required'),
  body('notifications.*.type').isIn([
    'task_assigned', 'task_updated', 'task_completed', 'task_overdue',
    'meeting_scheduled', 'meeting_reminder', 'meeting_cancelled',
    'leave_request', 'leave_approved', 'leave_rejected',
    'attendance_reminder', 'system_notification', 'announcement',
    'birthday_reminder', 'work_anniversary', 'holiday_reminder',
    'policy_update', 'other'
  ]).withMessage('Invalid notification type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: errors.array()[0].msg
      });
    }

    const { notifications } = req.body;

    // Add sender and companyId to each notification
    const notificationsWithMetadata = notifications.map(notification => ({
      ...notification,
      sender: req.user.id,
      companyId: req.user.companyId,
      priority: notification.priority || 'medium',
      channels: notification.channels || { inApp: { enabled: true } }
    }));

    const createdNotifications = await Notification.createBulkNotifications(notificationsWithMetadata);

    res.status(201).json({
      success: true,
      message: `${createdNotifications.length} notifications sent successfully`,
      data: {
        count: createdNotifications.length,
        batchId: createdNotifications[0]?.metadata?.batchId
      }
    });

  } catch (error) {
    console.error('Create bulk notifications error:', error);
    res.status(500).json({
      error: 'Failed to send bulk notifications',
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/notifications/:id
// @desc    Delete notification
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const notificationId = req.params.id;

    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return res.status(404).json({
        error: 'Notification not found',
        message: 'Notification does not exist'
      });
    }

    if (notification.recipient.toString() !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only delete your own notifications'
      });
    }

    await Notification.findByIdAndDelete(notificationId);

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      error: 'Failed to delete notification',
      message: 'Internal server error'
    });
  }
});

// @route   PATCH /api/notifications/:id/click
// @desc    Track notification click
// @access  Private
router.patch('/:id/click', async (req, res) => {
  try {
    const notificationId = req.params.id;
    const deviceInfo = req.body.deviceInfo || {};

    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return res.status(404).json({
        error: 'Notification not found',
        message: 'Notification does not exist'
      });
    }

    if (notification.recipient.toString() !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only track clicks on your own notifications'
      });
    }

    await notification.trackClick(deviceInfo);

    res.status(200).json({
      success: true,
      message: 'Click tracked successfully',
      data: {
        id: notification._id,
        clickCount: notification.clickCount,
        lastClickedAt: notification.lastClickedAt
      }
    });

  } catch (error) {
    console.error('Track notification click error:', error);
    res.status(500).json({
      error: 'Failed to track click',
      message: 'Internal server error'
    });
  }
});

module.exports = router;











