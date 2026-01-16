const express = require('express');
const { body, validationResult } = require('express-validator');
const { Device } = require('../models');

const router = express.Router();

// @route   GET /api/devices
// @desc    Get all devices for user
// @access  Private
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all devices for user
    const devices = await Device.find({ userId })
      .sort({ lastActive: -1 })
      .select('-accessToken -refreshToken -tokenExpiry');

    // Transform devices for response
    const transformedDevices = devices.map(device => ({
      id: device._id,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      deviceType: device.deviceType,
      browser: device.browser,
      os: device.os,
      ipAddress: device.ipAddress,
      isActive: device.isActive,
      isTrusted: device.isTrusted,
      firstLogin: device.firstLogin,
      lastActive: device.lastActive,
      loginCount: device.loginCount,
      status: device.status,
      sessionDuration: device.sessionDuration,
      location: device.location,
      activity: {
        lastLogin: device.activity.lastLogin,
        lastLogout: device.activity.lastLogout,
        totalSessionTime: device.activity.totalSessionTime,
        pageViews: device.activity.pageViews
      },
      security: {
        twoFactorEnabled: device.security.twoFactorEnabled,
        failedLoginAttempts: device.security.failedLoginAttempts,
        lockedUntil: device.security.lockedUntil
      },
      metadata: {
        screenResolution: device.metadata.screenResolution,
        colorDepth: device.metadata.colorDepth,
        touchSupport: device.metadata.touchSupport,
        webGLSupport: device.metadata.webGLSupport
      }
    }));

    res.status(200).json({
      success: true,
      devices: transformedDevices,
      total: devices.length,
      active: devices.filter(d => d.isActive).length
    });

  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({
      error: 'Failed to get devices',
      message: 'Internal server error'
    });
  }
});

// @route   PATCH /api/devices
// @desc    Perform device action (trust, lock, logout, etc.)
// @access  Private
router.patch('/', [
  body('deviceId').notEmpty().withMessage('Device ID is required'),
  body('action').isIn(['trust', 'untrust', 'lock', 'unlock', 'logout']).withMessage('Invalid action')
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

    const { deviceId, action } = req.body;
    const userId = req.user.id;

    const device = await Device.findOne({
      userId,
      deviceId,
      isActive: true
    });

    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        message: 'Device not found or not active'
      });
    }

    switch (action) {
      case 'trust':
        device.isTrusted = true;
        break;
      case 'untrust':
        device.isTrusted = false;
        break;
      case 'lock':
        device.security.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        break;
      case 'unlock':
        device.security.lockedUntil = null;
        device.security.failedLoginAttempts = 0;
        break;
      case 'logout':
        device.isActive = false;
        device.activity.lastLogout = new Date();
        device.accessToken = null;
        device.refreshToken = null;
        device.tokenExpiry = null;
        break;
      default:
        return res.status(400).json({
          error: 'Invalid action',
          message: 'Action not supported'
        });
    }

    await device.save();

    res.status(200).json({
      success: true,
      message: `Device ${action}ed successfully`,
      device: {
        id: device._id,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        isActive: device.isActive,
        isTrusted: device.isTrusted,
        status: device.status
      }
    });

  } catch (error) {
    console.error('Device action error:', error);
    res.status(500).json({
      error: 'Device action failed',
      message: 'Internal server error'
    });
  }
});

// @route   DELETE /api/devices
// @desc    Delete device
// @access  Private
router.delete('/', [
  body('deviceId').notEmpty().withMessage('Device ID is required')
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

    const { deviceId } = req.body;
    const userId = req.user.id;
    const currentDeviceId = req.user.deviceId;

    const device = await Device.findOne({
      userId,
      deviceId
    });

    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        message: 'Device not found'
      });
    }

    // Check if trying to delete current device
    if (deviceId === currentDeviceId) {
      return res.status(400).json({
        error: 'Cannot delete current device',
        message: 'You cannot delete the device you are currently using'
      });
    }

    // Delete device
    await Device.findByIdAndDelete(device._id);

    res.status(200).json({
      success: true,
      message: 'Device deleted successfully'
    });

  } catch (error) {
    console.error('Delete device error:', error);
    res.status(500).json({
      error: 'Failed to delete device',
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/devices/activity
// @desc    Record device activity
// @access  Private
router.post('/activity', [
  body('action').notEmpty().withMessage('Action is required'),
  body('details').optional().isObject().withMessage('Details must be an object'),
  body('pageView').optional().isBoolean().withMessage('Page view must be a boolean')
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

    const { action, details, pageView = false } = req.body;
    const userId = req.user.id;
    const deviceId = req.user.deviceId;

    const device = await Device.findOne({
      userId,
      deviceId,
      isActive: true
    });

    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        message: 'Device not found or not active'
      });
    }

    // Update device activity
    device.lastActive = new Date();
    
    if (pageView) {
      device.activity.pageViews += 1;
    }

    // Add action to activity log
    device.activity.actions.push({
      action,
      timestamp: new Date(),
      details
    });

    // Keep only last 100 actions to prevent array from growing too large
    if (device.activity.actions.length > 100) {
      device.activity.actions = device.activity.actions.slice(-100);
    }

    await device.save();

    res.status(200).json({
      success: true,
      message: 'Activity recorded successfully',
      activity: {
        action,
        timestamp: new Date(),
        pageViews: device.activity.pageViews,
        totalActions: device.activity.actions.length
      }
    });

  } catch (error) {
    console.error('Activity tracking error:', error);
    res.status(500).json({
      error: 'Failed to record activity',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/devices/activity
// @desc    Get device activity history
// @access  Private
router.get('/activity', async (req, res) => {
  try {
    const userId = req.user.id;
    const deviceId = req.user.deviceId;
    const { limit = 50, offset = 0 } = req.query;

    const device = await Device.findOne({
      userId,
      deviceId,
      isActive: true
    }).select('activity');

    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        message: 'Device not found or not active'
      });
    }

    // Get paginated actions
    const actions = device.activity.actions
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.status(200).json({
      success: true,
      activity: {
        actions,
        totalActions: device.activity.actions.length,
        pageViews: device.activity.pageViews,
        totalSessionTime: device.activity.totalSessionTime,
        lastLogin: device.activity.lastLogin,
        lastLogout: device.activity.lastLogout
      },
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < device.activity.actions.length
      }
    });

  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({
      error: 'Failed to get activity',
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/devices/settings
// @desc    Get device settings
// @access  Private
router.get('/settings', async (req, res) => {
  try {
    const userId = req.user.id;
    const deviceId = req.user.deviceId;

    const device = await Device.findOne({
      userId,
      deviceId,
      isActive: true
    }).select('settings permissions metadata');

    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        message: 'Device not found or not active'
      });
    }

    res.status(200).json({
      success: true,
      settings: {
        device: {
          theme: device.settings.theme,
          language: device.settings.language,
          timezone: device.settings.timezone
        },
        permissions: device.permissions,
        metadata: device.metadata
      }
    });

  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      error: 'Failed to get settings',
      message: 'Internal server error'
    });
  }
});

// @route   PATCH /api/devices/settings
// @desc    Update device settings
// @access  Private
router.patch('/settings', [
  body('settings').optional().isObject().withMessage('Settings must be an object'),
  body('permissions').optional().isObject().withMessage('Permissions must be an object'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object')
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

    const { settings, permissions, metadata } = req.body;
    const userId = req.user.id;
    const deviceId = req.user.deviceId;

    const device = await Device.findOne({
      userId,
      deviceId,
      isActive: true
    });

    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        message: 'Device not found or not active'
      });
    }

    // Update device settings
    if (settings) {
      if (settings.theme) device.settings.theme = settings.theme;
      if (settings.language) device.settings.language = settings.language;
      if (settings.timezone) device.settings.timezone = settings.timezone;
    }

    // Update permissions
    if (permissions) {
      if (typeof permissions.notifications === 'boolean') {
        device.permissions.notifications = permissions.notifications;
      }
      if (typeof permissions.location === 'boolean') {
        device.permissions.location = permissions.location;
      }
      if (typeof permissions.camera === 'boolean') {
        device.permissions.camera = permissions.camera;
      }
      if (typeof permissions.microphone === 'boolean') {
        device.permissions.microphone = permissions.microphone;
      }
    }

    // Update metadata
    if (metadata) {
      if (metadata.screenResolution) device.metadata.screenResolution = metadata.screenResolution;
      if (metadata.colorDepth) device.metadata.colorDepth = metadata.colorDepth;
      if (metadata.pixelRatio) device.metadata.pixelRatio = metadata.pixelRatio;
      if (typeof metadata.touchSupport === 'boolean') device.metadata.touchSupport = metadata.touchSupport;
      if (typeof metadata.webGLSupport === 'boolean') device.metadata.webGLSupport = metadata.webGLSupport;
      if (typeof metadata.cookieEnabled === 'boolean') device.metadata.cookieEnabled = metadata.cookieEnabled;
      if (typeof metadata.doNotTrack === 'boolean') device.metadata.doNotTrack = metadata.doNotTrack;
    }

    await device.save();

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      settings: {
        device: {
          theme: device.settings.theme,
          language: device.settings.language,
          timezone: device.settings.timezone
        },
        permissions: device.permissions,
        metadata: device.metadata
      }
    });

  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      error: 'Failed to update settings',
      message: 'Internal server error'
    });
  }
});

module.exports = router;











