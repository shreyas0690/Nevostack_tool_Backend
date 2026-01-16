const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  deviceId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userAgent: {
    type: String,
    required: true
  },
  ipAddress: {
    type: String,
    required: true
  },
  deviceType: {
    type: String,
    enum: ['mobile', 'desktop', 'tablet'],
    required: true
  },
  browser: {
    type: String,
    required: true
  },
  os: {
    type: String,
    required: true
  },
  deviceName: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isTrusted: {
    type: Boolean,
    default: false
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  firstLogin: {
    type: Date,
    default: Date.now
  },
  loginCount: {
    type: Number,
    default: 1
  },
  refreshToken: {
    type: String,
    default: null
  },
  accessToken: {
    type: String,
    default: null
  },
  tokenExpiry: {
    type: Date,
    default: null
  },
  location: {
    country: String,
    city: String,
    timezone: String
  },
  permissions: {
    notifications: {
      type: Boolean,
      default: false
    },
    location: {
      type: Boolean,
      default: false
    },
    camera: {
      type: Boolean,
      default: false
    },
    microphone: {
      type: Boolean,
      default: false
    }
  },
  settings: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    },
    language: {
      type: String,
      default: 'en'
    },
    timezone: {
      type: String,
      default: 'UTC'
    }
  },
  security: {
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    lastPasswordChange: Date,
    failedLoginAttempts: {
      type: Number,
      default: 0
    },
    lockedUntil: Date
  },
  activity: {
    lastLogin: {
      type: Date,
      default: Date.now
    },
    lastLogout: Date,
    totalSessionTime: {
      type: Number,
      default: 0
    },
    pageViews: {
      type: Number,
      default: 0
    },
    actions: [{
      action: {
        type: String,
        required: true
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      details: mongoose.Schema.Types.Mixed
    }]
  },
  metadata: {
    screenResolution: String,
    colorDepth: Number,
    pixelRatio: Number,
    touchSupport: {
      type: Boolean,
      default: false
    },
    webGLSupport: {
      type: Boolean,
      default: false
    },
    cookieEnabled: {
      type: Boolean,
      default: true
    },
    doNotTrack: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
DeviceSchema.index({ userId: 1, isActive: 1 });
DeviceSchema.index({ deviceId: 1, isActive: 1 });
DeviceSchema.index({ lastActive: -1 });
DeviceSchema.index({ 'activity.lastLogin': -1 });

// Virtual for device status
DeviceSchema.virtual('status').get(function() {
  if (!this.isActive) return 'inactive';
  if (this.security.lockedUntil && this.security.lockedUntil > new Date()) return 'locked';
  return 'active';
});

// Virtual for session duration
DeviceSchema.virtual('sessionDuration').get(function() {
  if (!this.activity.lastLogin) return 0;
  const now = new Date();
  const lastLogin = this.activity.lastLogin;
  return Math.floor((now.getTime() - lastLogin.getTime()) / (1000 * 60)); // minutes
});

// Method to update device activity
DeviceSchema.methods.updateActivity = function(action, details) {
  this.lastActive = new Date();
  
  if (action) {
    this.activity.actions.push({
      action,
      timestamp: new Date(),
      details
    });
  }
  
  return this.save();
};

// Method to increment login count
DeviceSchema.methods.incrementLogin = function() {
  this.loginCount += 1;
  this.activity.lastLogin = new Date();
  this.lastActive = new Date();
  return this.save();
};

// Method to logout device
DeviceSchema.methods.logout = function() {
  this.isActive = false;
  this.activity.lastLogout = new Date();
  this.accessToken = null;
  this.refreshToken = null;
  this.tokenExpiry = null;
  return this.save();
};

// Method to trust device
DeviceSchema.methods.trustDevice = function() {
  this.isTrusted = true;
  return this.save();
};

// Method to lock device
DeviceSchema.methods.lockDevice = function(durationMinutes = 30) {
  this.security.lockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
  return this.save();
};

// Method to unlock device
DeviceSchema.methods.unlockDevice = function() {
  this.security.lockedUntil = undefined;
  this.security.failedLoginAttempts = 0;
  return this.save();
};

// Static method to find active devices for user
DeviceSchema.statics.findActiveDevices = function(userId) {
  return this.find({
    userId,
    isActive: true
  }).sort({ lastActive: -1 });
};

// Static method to find device by device ID
DeviceSchema.statics.findByDeviceId = function(deviceId) {
  return this.findOne({ deviceId });
};

// Static method to cleanup old inactive devices
DeviceSchema.statics.cleanupOldDevices = function(daysOld = 30) {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  return this.deleteMany({
    isActive: false,
    lastActive: { $lt: cutoffDate }
  });
};

// Pre-save middleware to update timestamps
DeviceSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-save middleware to validate device data
DeviceSchema.pre('save', function(next) {
  if (this.security.failedLoginAttempts < 0) {
    this.security.failedLoginAttempts = 0;
  }
  
  if (this.loginCount < 1) {
    this.loginCount = 1;
  }
  
  next();
});

module.exports = mongoose.models.Device || mongoose.model('Device', DeviceSchema);