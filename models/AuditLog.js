const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null
  },
  userEmail: {
    type: String,
    required: true,
    trim: true
  },
  userName: {
    type: String,
    required: true,
    trim: true
  },
  userRole: {
    type: String,
    required: true,
    enum: ['super_admin', 'admin', 'department_head', 'manager', 'member', 'system'],
    default: 'member'
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    default: null
  },
  companyName: {
    type: String,
    trim: true,
    default: ''
  },
  action: {
    type: String,
    required: true,
    trim: true,
    enum: [
      // User Management
      'user_created', 'user_updated', 'user_deleted', 'user_status_changed',
      'user_role_changed', 'user_login', 'user_logout', 'user_password_reset',

      // Company Management
      'company_created', 'company_updated', 'company_deleted', 'company_suspended',
      'company_activated', 'company_subscription_changed',

      // Department Management
      'department_created', 'department_updated', 'department_deleted',

      // Task Management
      'task_created', 'task_updated', 'task_deleted', 'task_assigned', 'task_status_changed',

      // Meeting Management
      'meeting_created', 'meeting_updated', 'meeting_deleted', 'meeting_scheduled',
      'meeting_attended', 'meeting_cancelled',

      // Leave Management
      'leave_requested', 'leave_approved', 'leave_rejected', 'leave_cancelled',

      // Billing & Subscription
      'subscription_created', 'subscription_updated', 'subscription_cancelled',
      'payment_processed', 'payment_failed', 'plan_upgraded', 'plan_downgraded',

      // System & Security
      'login_success', 'login_failed', 'logout', 'password_changed',
      'profile_updated', 'settings_changed', 'brute_force_attempt',
      'suspicious_activity', 'system_backup', 'system_maintenance',

      // Admin Actions
      'admin_login', 'admin_action', 'bulk_operation', 'data_export',
      'system_config_changed', 'security_alert'
    ]
  },
  category: {
    type: String,
    required: true,
    enum: ['system', 'user', 'admin', 'security'],
    default: 'user'
  },
  severity: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  ipAddress: {
    type: String,
    trim: true,
    default: ''
  },
  userAgent: {
    type: String,
    trim: true,
    default: ''
  },
  device: {
    type: String,
    trim: true,
    default: ''
  },
  location: {
    type: String,
    trim: true,
    default: ''
  },
  metadata: {
    resourceId: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    resourceType: {
      type: String,
      enum: ['user', 'company', 'department', 'task', 'meeting', 'leave', 'subscription', 'payment', 'system'],
      default: null
    },
    oldValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    reason: {
      type: String,
      trim: true,
      default: null
    },
    additionalData: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  status: {
    type: String,
    required: true,
    enum: ['success', 'failed', 'pending', 'warning'],
    default: 'success'
  },
  sessionId: {
    type: String,
    trim: true,
    default: null
  },
  requestId: {
    type: String,
    trim: true,
    default: null
  }
}, {
  timestamps: true,
  indexes: [
    { timestamp: -1 },
    { userId: 1 },
    { companyId: 1 },
    { action: 1 },
    { category: 1 },
    { severity: 1 },
    { status: 1 },
    { 'metadata.resourceType': 1 },
    { 'metadata.resourceId': 1 },
    { userEmail: 1 },
    { ipAddress: 1 }
  ]
});

// Static method to create audit log
auditLogSchema.statics.createLog = async function(logData) {
  try {
    const auditLog = new this(logData);
    await auditLog.save();
    return auditLog;
  } catch (error) {
    console.error('Error creating audit log:', error);
    // Don't throw error to prevent audit logging from breaking main functionality
    return null;
  }
};

// Instance method to get formatted log
auditLogSchema.methods.toFormattedLog = function() {
  return {
    _id: this._id,
    timestamp: this.timestamp.toISOString(),
    userId: this.userId,
    userEmail: this.userEmail,
    userName: this.userName,
    userRole: this.userRole,
    companyId: this.companyId,
    companyName: this.companyName,
    action: this.action,
    category: this.category,
    severity: this.severity,
    description: this.description,
    ipAddress: this.ipAddress,
    userAgent: this.userAgent,
    device: this.device,
    location: this.location,
    metadata: this.metadata,
    status: this.status
  };
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
