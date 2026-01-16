const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace'
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  // role of the requester at time of request (HOD/Manager/Member/Admin)
  roleAtRequest: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['sick', 'casual', 'annual', 'maternity', 'paternity', 'unpaid', 'emergency', 'compensatory', 'other'],
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  days: {
    type: Number,
    required: true,
    min: 0.5,
    max: 365
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  rejectionReason: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  // Emergency contact information provided by requester
  emergencyContact: {
    type: String,
    trim: true,
    default: ''
  },
  attachments: [{
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    url: String
  }],
  halfDay: {
    type: Boolean,
    default: false
  },
  halfDayType: {
    type: String,
    enum: ['first-half', 'second-half'],
    default: 'first-half'
  }
  ,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Audit trail for actions on this leave
  audit: [
    {
      action: { type: String },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at: { type: Date },
      meta: { type: mongoose.Schema.Types.Mixed }
    }
  ],
  // Soft-delete flag
  deleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
leaveSchema.index({ userId: 1, startDate: 1 });
leaveSchema.index({ companyId: 1, status: 1 });
leaveSchema.index({ departmentId: 1, status: 1 });
leaveSchema.index({ status: 1 });
leaveSchema.index({ startDate: 1, endDate: 1 });
leaveSchema.index({ approvedBy: 1 });
leaveSchema.index({ deleted: 1 });

// Instance methods
leaveSchema.methods.isOverlapping = async function() {
  const overlappingLeave = await this.constructor.findOne({
    userId: this.userId,
    _id: { $ne: this._id },
    status: { $in: ['pending', 'approved'] },
    $or: [
      {
        startDate: { $lte: this.endDate },
        endDate: { $gte: this.startDate }
      }
    ]
  });
  
  return !!overlappingLeave;
};

leaveSchema.methods.calculateDays = function() {
  if (!this.startDate || !this.endDate) {
    return 0;
  }
  
  const start = new Date(this.startDate);
  const end = new Date(this.endDate);
  
  // Reset time to start of day
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  
  const diffTime = end - start;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  
  // If it's a half day, reduce by 0.5
  if (this.halfDay) {
    return diffDays - 0.5;
  }
  
  return diffDays;
};

leaveSchema.methods.isApproved = function() {
  return this.status === 'approved';
};

leaveSchema.methods.isPending = function() {
  return this.status === 'pending';
};

leaveSchema.methods.isRejected = function() {
  return this.status === 'rejected';
};

leaveSchema.methods.canBeCancelled = function() {
  return this.status === 'pending' || this.status === 'approved';
};

leaveSchema.methods.isInFuture = function() {
  return new Date() < this.startDate;
};

// Add an audit entry
leaveSchema.methods.addAuditEntry = function(action, by, meta = {}) {
  this.audit = this.audit || [];
  this.audit.push({ action, by, at: new Date(), meta });
};

// Static methods
leaveSchema.statics.findByUser = function(userId, options = {}) {
  const query = { userId };
  
  if (options.status) {
    query.status = options.status;
  }
  
  if (options.startDate && options.endDate) {
    query.startDate = { $gte: new Date(options.startDate) };
    query.endDate = { $lte: new Date(options.endDate) };
  }
  
  return this.find(query)
    .populate('approvedBy', 'firstName lastName email')
    .sort(options.sort || { startDate: -1 });
};

leaveSchema.statics.findByCompany = function(companyId, options = {}) {
  const query = { companyId };
  
  if (options.status) {
    query.status = options.status;
  }
  
  if (options.departmentId) {
    query.departmentId = options.departmentId;
  }
  
  if (options.startDate && options.endDate) {
    query.startDate = { $gte: new Date(options.startDate) };
    query.endDate = { $lte: new Date(options.endDate) };
  }
  
  return this.find(query)
    .populate('userId', 'firstName lastName email avatar')
    .populate('approvedBy', 'firstName lastName email')
    .populate('departmentId', 'name')
    .sort(options.sort || { startDate: -1 });
};

leaveSchema.statics.findPendingByApprover = function(approverId) {
  return this.find({
    approvedBy: approverId,
    status: 'pending'
  })
  .populate('userId', 'firstName lastName email avatar')
  .populate('departmentId', 'name')
  .sort({ startDate: 1 });
};

leaveSchema.statics.getUserLeaveBalance = async function(userId, year) {
  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year, 11, 31);
  
  const leaves = await this.find({
    userId,
    startDate: { $gte: startOfYear },
    endDate: { $lte: endOfYear },
    status: 'approved'
  });
  
  const balance = {
    sick: 0,
    casual: 0,
    annual: 0,
    maternity: 0,
    paternity: 0,
    unpaid: 0,
    other: 0,
    total: 0
  };
  
  leaves.forEach(leave => {
    balance[leave.type] += leave.days;
    balance.total += leave.days;
  });
  
  return balance;
};

leaveSchema.statics.getCompanyLeaveStats = async function(companyId, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const leaves = await this.find({
    companyId,
    startDate: { $gte: start },
    endDate: { $lte: end }
  });
  
  const stats = {
    total: leaves.length,
    pending: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
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
    totalDays: 0
  };
  
  leaves.forEach(leave => {
    stats[leave.status]++;
    stats.byType[leave.type]++;
    stats.totalDays += leave.days;
  });
  
  return stats;
};

// Pre-save middleware
leaveSchema.pre('save', function(next) {
  if (this.isModified('startDate') || this.isModified('endDate')) {
    this.days = this.calculateDays();
  }
  
  if (this.isModified('status') && this.status === 'approved' && !this.approvedAt) {
    this.approvedAt = new Date();
  }
  
  next();
});

// Pre-remove middleware
leaveSchema.pre('remove', function(next) {
  // Clean up any attachments if needed
  next();
});

module.exports = mongoose.model('Leave', leaveSchema);











