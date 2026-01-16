const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  type: {
    type: String,
    enum: [
      'task_assigned',
      'task_updated',
      'task_completed',
      'task_overdue',
      'meeting_scheduled',
      'meeting_reminder',
      'meeting_cancelled',
      'leave_request',
      'leave_approved',
      'leave_rejected',
      'attendance_reminder',
      'system_notification',
      'announcement',
      'birthday_reminder',
      'work_anniversary',
      'holiday_reminder',
      'policy_update',
      'other'
    ],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
    default: 'pending'
  },
  channels: {
    inApp: {
      enabled: {
        type: Boolean,
        default: true
      },
      delivered: {
        type: Boolean,
        default: false
      },
      deliveredAt: Date
    },
    email: {
      enabled: {
        type: Boolean,
        default: false
      },
      delivered: {
        type: Boolean,
        default: false
      },
      deliveredAt: Date,
      emailId: String,
      error: String
    },
    push: {
      enabled: {
        type: Boolean,
        default: false
      },
      delivered: {
        type: Boolean,
        default: false
      },
      deliveredAt: Date,
      pushId: String,
      error: String
    },
    sms: {
      enabled: {
        type: Boolean,
        default: false
      },
      delivered: {
        type: Boolean,
        default: false
      },
      deliveredAt: Date,
      smsId: String,
      error: String
    }
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  actionUrl: {
    type: String,
    trim: true
  },
  actionText: {
    type: String,
    trim: true,
    default: 'View'
  },
  expiresAt: {
    type: Date
  },
  readAt: {
    type: Date
  },
  isRead: {
    type: Boolean,
    default: false
  },
  clickCount: {
    type: Number,
    default: 0
  },
  lastClickedAt: {
    type: Date
  },
  metadata: {
    deviceInfo: {
      userAgent: String,
      platform: String,
      browser: String
    },
    source: {
      type: String,
      enum: ['system', 'user', 'scheduler', 'webhook'],
      default: 'system'
    },
    batchId: String,
    templateId: String,
    correlationId: String
  },
  scheduledFor: {
    type: Date
  },
  retryCount: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 3
  },
  lastRetryAt: {
    type: Date
  },
  failureReason: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for better performance
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ type: 1, status: 1 });
notificationSchema.index({ companyId: 1, createdAt: -1 });
notificationSchema.index({ status: 1, scheduledFor: 1 });
notificationSchema.index({ expiresAt: 1 });
notificationSchema.index({ 'metadata.batchId': 1 });

// Virtual for time ago
notificationSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diff = now - this.createdAt;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
});

// Virtual for delivery status
notificationSchema.virtual('deliveryStatus').get(function() {
  const statuses = [];
  
  if (this.channels.inApp.enabled && this.channels.inApp.delivered) {
    statuses.push('in-app');
  }
  if (this.channels.email.enabled && this.channels.email.delivered) {
    statuses.push('email');
  }
  if (this.channels.push.enabled && this.channels.push.delivered) {
    statuses.push('push');
  }
  if (this.channels.sms.enabled && this.channels.sms.delivered) {
    statuses.push('sms');
  }
  
  return statuses;
});

// Virtual for is expired
notificationSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

// Method to mark as read
notificationSchema.methods.markAsRead = function() {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
  this.status = 'read';
  }
  return this.save();
};

// Method to mark as unread
notificationSchema.methods.markAsUnread = function() {
  this.isRead = false;
  this.readAt = null;
  if (this.status === 'read') {
    this.status = 'delivered';
  }
  return this.save();
};

// Method to track click
notificationSchema.methods.trackClick = function(deviceInfo = {}) {
  this.clickCount += 1;
  this.lastClickedAt = new Date();
  if (deviceInfo) {
    this.metadata.deviceInfo = deviceInfo;
  }
  
  // Mark as read when clicked
  if (!this.isRead) {
    this.markAsRead();
  }
  
  return this.save();
};

// Method to mark channel as delivered
notificationSchema.methods.markChannelDelivered = function(channel, deliveryId = null, error = null) {
  if (this.channels[channel]) {
    this.channels[channel].delivered = !error;
    this.channels[channel].deliveredAt = new Date();
    
    if (deliveryId) {
      const idField = channel === 'email' ? 'emailId' : 
                     channel === 'push' ? 'pushId' : 
                     channel === 'sms' ? 'smsId' : null;
      
      if (idField) {
        this.channels[channel][idField] = deliveryId;
      }
    }
    
    if (error) {
      this.channels[channel].error = error;
    }
    
    // Update overall status
    this.updateOverallStatus();
  }
  
  return this.save();
};

// Method to update overall status
notificationSchema.methods.updateOverallStatus = function() {
  const enabledChannels = Object.keys(this.channels).filter(
    channel => this.channels[channel].enabled
  );
  
  if (enabledChannels.length === 0) {
    this.status = 'sent';
    return;
  }
  
  const deliveredChannels = enabledChannels.filter(
    channel => this.channels[channel].delivered
  );
  
  const failedChannels = enabledChannels.filter(
    channel => this.channels[channel].error
  );
  
  if (deliveredChannels.length === enabledChannels.length) {
    this.status = this.isRead ? 'read' : 'delivered';
  } else if (failedChannels.length === enabledChannels.length) {
    this.status = 'failed';
  } else if (deliveredChannels.length > 0) {
    this.status = 'delivered';
  } else {
    this.status = 'sent';
  }
};

// Method to retry failed delivery
notificationSchema.methods.retryDelivery = function() {
  if (this.retryCount >= this.maxRetries) {
    this.status = 'failed';
    this.failureReason = 'Maximum retry attempts exceeded';
    return this.save();
  }
  
  this.retryCount += 1;
  this.lastRetryAt = new Date();
  this.status = 'pending';
  this.failureReason = null;
  
  // Reset failed channel errors
  Object.keys(this.channels).forEach(channel => {
    if (this.channels[channel].error) {
      this.channels[channel].error = null;
      this.channels[channel].delivered = false;
    }
  });
  
  return this.save();
};

// Static method to get unread count for user
notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({
    recipient: userId,
    isRead: false,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  });
};

// Static method to get notifications for user
notificationSchema.statics.getForUser = function(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    unreadOnly = false,
    type = null,
    priority = null
  } = options;
  
  const query = {
    recipient: userId,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  };
  
  if (unreadOnly) {
    query.isRead = false;
  }
  
  if (type) {
    query.type = type;
  }
  
  if (priority) {
    query.priority = priority;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('sender', 'firstName lastName avatar');
};

// Static method to mark all as read for user
notificationSchema.statics.markAllAsReadForUser = function(userId) {
  return this.updateMany(
    {
      recipient: userId,
      isRead: false
    },
    { 
      isRead: true,
      readAt: new Date(),
      status: 'read'
    }
  );
};

// Static method to create bulk notifications
notificationSchema.statics.createBulkNotifications = function(notifications) {
  const batchId = new mongoose.Types.ObjectId().toString();
  
  const notificationsWithBatch = notifications.map(notification => ({
    ...notification,
    'metadata.batchId': batchId,
    'metadata.source': 'system'
  }));
  
  return this.insertMany(notificationsWithBatch);
};

// Static method to get pending notifications for processing
notificationSchema.statics.getPendingNotifications = function(limit = 100) {
  return this.find({
    status: 'pending',
    $or: [
      { scheduledFor: { $exists: false } },
      { scheduledFor: { $lte: new Date() } }
    ],
    retryCount: { $lt: mongoose.Schema.obj.maxRetries || 3 }
  })
  .sort({ priority: -1, createdAt: 1 })
  .limit(limit);
};

// Static method to cleanup expired notifications
notificationSchema.statics.cleanupExpired = function() {
  return this.deleteMany({
    expiresAt: { $lt: new Date() },
    isRead: true
  });
};

// Pre-save middleware
notificationSchema.pre('save', function(next) {
  // Set expiry date if not provided (default 30 days)
  if (!this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  
  // Auto-mark in-app delivery
  if (this.channels.inApp.enabled && !this.channels.inApp.delivered) {
    this.channels.inApp.delivered = true;
    this.channels.inApp.deliveredAt = new Date();
  }
  
  next();
});

// Post-save middleware for real-time notifications
notificationSchema.post('save', function(doc) {
  // Here you can emit real-time notifications via WebSocket
  // Example: socketService.emitToUser(doc.recipient, 'notification', doc);
});

module.exports = mongoose.model('Notification', notificationSchema);