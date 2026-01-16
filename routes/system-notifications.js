const express = require('express');
const { body, validationResult } = require('express-validator');
const { Notification, User } = require('../models');
const { requireRole, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/system-notifications/birthday-reminder
// @desc    Create birthday reminder notifications
// @access  Private (Admin, HR)
router.post('/birthday-reminder', requireRole(['admin', 'hr', 'hr_manager']), async (req, res) => {
  try {
    console.log('🎂 Creating birthday reminder notifications');
    
    // Find users with birthdays today
    const today = new Date();
    const todayStr = `${today.getMonth() + 1}-${today.getDate()}`;
    
    const usersWithBirthdays = await User.find({
      $expr: {
        $eq: [
          { $dateToString: { format: "%m-%d", date: "$dateOfBirth" } },
          todayStr
        ]
      }
    });

    console.log('🎂 Users with birthdays today:', usersWithBirthdays.length);

    for (const user of usersWithBirthdays) {
      // Create notification for the birthday person
      const birthdayNotification = new Notification({
        recipient: user._id,
        sender: req.user.id,
        companyId: user.companyId,
        title: 'Happy Birthday! 🎉',
        message: `Wishing you a very happy birthday, ${user.firstName}! May this year bring you joy and success.`,
        type: 'birthday_reminder',
        priority: 'medium',
        actionUrl: '/profile',
        actionText: 'View Profile',
        data: {
          birthdayPerson: user._id,
          birthdayPersonName: `${user.firstName} ${user.lastName}`,
          birthdayDate: user.dateOfBirth
        }
      });

      await birthdayNotification.save();

      // Create notifications for colleagues to wish the birthday person
      const colleagues = await User.find({
        companyId: user.companyId,
        _id: { $ne: user._id }
      });

      for (const colleague of colleagues) {
        const colleagueNotification = new Notification({
          recipient: colleague._id,
          sender: req.user.id,
          companyId: user.companyId,
          title: `Birthday Reminder: ${user.firstName} ${user.lastName}`,
          message: `Today is ${user.firstName} ${user.lastName}'s birthday! Don't forget to wish them.`,
          type: 'birthday_reminder',
          priority: 'low',
          actionUrl: `/users/${user._id}`,
          actionText: 'Send Wishes',
          data: {
            birthdayPerson: user._id,
            birthdayPersonName: `${user.firstName} ${user.lastName}`,
            birthdayDate: user.dateOfBirth
          }
        });

        await colleagueNotification.save();
      }
    }

    res.status(200).json({
      success: true,
      message: `Birthday reminders created for ${usersWithBirthdays.length} users`,
      data: {
        birthdayCount: usersWithBirthdays.length,
        notificationsCreated: usersWithBirthdays.length + (usersWithBirthdays.length * (await User.countDocuments({ companyId: req.user.companyId })) - usersWithBirthdays.length)
      }
    });

  } catch (error) {
    console.error('Birthday reminder error:', error);
    res.status(500).json({
      error: 'Failed to create birthday reminders',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/system-notifications/policy-update
// @desc    Create policy update notifications
// @access  Private (Admin, HR)
router.post('/policy-update', requireRole(['admin', 'hr', 'hr_manager']), [
  body('title').notEmpty().withMessage('Title is required'),
  body('message').notEmpty().withMessage('Message is required'),
  body('policyType').optional().isIn(['hr', 'company', 'safety', 'it', 'other']),
  body('actionUrl').optional().isURL()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: errors.array()[0].msg
      });
    }

    const { title, message, policyType = 'company', actionUrl } = req.body;

    console.log('📋 Creating policy update notifications');

    // Get all users in the company
    const users = await User.find({ companyId: req.user.companyId });

    for (const user of users) {
      const notification = new Notification({
        recipient: user._id,
        sender: req.user.id,
        companyId: req.user.companyId,
        title: `Policy Update: ${title}`,
        message: message,
        type: 'policy_update',
        priority: 'high',
        actionUrl: actionUrl || '/policies',
        actionText: 'View Policy',
        data: {
          policyType: policyType,
          updatedBy: req.user.id,
          updateDate: new Date()
        }
      });

      await notification.save();
    }

    res.status(200).json({
      success: true,
      message: `Policy update notifications sent to ${users.length} users`,
      data: {
        recipientCount: users.length,
        policyType: policyType
      }
    });

  } catch (error) {
    console.error('Policy update notification error:', error);
    res.status(500).json({
      error: 'Failed to send policy update notifications',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/system-notifications/announcement
// @desc    Create company announcement notifications
// @access  Private (Admin, HR)
router.post('/announcement', requireRole(['admin', 'hr', 'hr_manager']), [
  body('title').notEmpty().withMessage('Title is required'),
  body('message').notEmpty().withMessage('Message is required'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('actionUrl').optional().isURL()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: errors.array()[0].msg
      });
    }

    const { title, message, priority = 'medium', actionUrl } = req.body;

    console.log('📢 Creating announcement notifications');

    // Get all users in the company
    const users = await User.find({ companyId: req.user.companyId });

    for (const user of users) {
      const notification = new Notification({
        recipient: user._id,
        sender: req.user.id,
        companyId: req.user.companyId,
        title: `Announcement: ${title}`,
        message: message,
        type: 'announcement',
        priority: priority,
        actionUrl: actionUrl || '/announcements',
        actionText: 'View Details',
        data: {
          announcementType: 'company',
          announcedBy: req.user.id,
          announcementDate: new Date()
        }
      });

      await notification.save();
    }

    res.status(200).json({
      success: true,
      message: `Announcement notifications sent to ${users.length} users`,
      data: {
        recipientCount: users.length,
        priority: priority
      }
    });

  } catch (error) {
    console.error('Announcement notification error:', error);
    res.status(500).json({
      error: 'Failed to send announcement notifications',
      message: 'Internal server error'
    });
  }
});

module.exports = router;




