const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  
  // Enhanced Management Structure
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  headId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  managerIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Department Hierarchy
  parentDepartmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  childDepartments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  }],
  level: {
    type: Number,
    default: 1
  },
  
  // Enhanced Status & Metadata
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived', 'pending'],
    default: 'active'
  },
  type: {
    type: String,
    enum: ['main', 'sub', 'project', 'temporary'],
    default: 'main'
  },
  
  // Employee Management
  employeeCount: {
    type: Number,
    default: 0
  },
  maxEmployees: {
    type: Number,
    default: 50
  },
  memberIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Department Settings for Admin Panel
  settings: {
    allowLeaveRequests: {
      type: Boolean,
      default: true
    },
    requireManagerApproval: {
      type: Boolean,
      default: true
    },
    maxLeaveDays: {
      type: Number,
      default: 30
    },
    workingHours: {
      start: {
        type: String,
        default: '09:00'
      },
      end: {
        type: String,
        default: '17:00'
      }
    },
    workingDays: {
      type: [String],
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      default: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
    },
    // Admin Panel Specific Settings
    allowUserCreation: {
      type: Boolean,
      default: true
    },
    allowUserDeletion: {
      type: Boolean,
      default: false
    },
    requireApprovalForChanges: {
      type: Boolean,
      default: true
    },
    autoAssignManager: {
      type: Boolean,
      default: false
    }
  },
  
  // Enhanced Metadata for Admin Panel
  metadata: {
    icon: {
      type: String,
      default: 'building'
    },
    color: {
      type: String,
      default: '#3B82F6'
    },
    location: {
      type: String,
      default: ''
    },
    contactInfo: {
      phone: String,
      email: String,
      address: String
    },
    tags: [String],
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    }
  },
  
  // Performance Metrics for Admin Panel
  metrics: {
    productivity: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    attendance: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    projectCompletion: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  
  // Audit Trail for Admin Panel
  auditLog: [{
    action: {
      type: String,
      enum: ['created', 'updated', 'deleted', 'user_added', 'user_removed', 'manager_changed']
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true
});

// Indexes
departmentSchema.index({ companyId: 1, name: 1 }, { unique: true });
departmentSchema.index({ companyId: 1, status: 1 });
departmentSchema.index({ managerId: 1 });
departmentSchema.index({ status: 1 });

// Instance methods
departmentSchema.methods.updateEmployeeCount = async function() {
  const User = mongoose.model('User');
  const count = await User.countDocuments({ 
    departmentId: this._id, 
    status: 'active' 
  });
  
  this.employeeCount = count;
  return this.save();
};

departmentSchema.methods.getEmployees = function(options = {}) {
  const User = mongoose.model('User');
  const query = { departmentId: this._id };
  
  if (options.status) {
    query.status = options.status;
  }
  
  return User.find(query)
    .select(options.select || 'firstName lastName email role status avatar lastActive')
    .sort(options.sort || { firstName: 1, lastName: 1 });
};

departmentSchema.methods.getManager = function() {
  if (!this.managerId) {
    return null;
  }
  
  const User = mongoose.model('User');
  return User.findById(this.managerId)
    .select('firstName lastName email avatar role status');
};

departmentSchema.methods.isWorkingDay = function(date) {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'lowercase' });
  return this.settings.workingDays.includes(dayName);
};

departmentSchema.methods.isWorkingHour = function(time) {
  const [hours, minutes] = time.split(':').map(Number);
  const timeInMinutes = hours * 60 + minutes;
  
  const [startHours, startMinutes] = this.settings.workingHours.start.split(':').map(Number);
  const startTimeInMinutes = startHours * 60 + startMinutes;
  
  const [endHours, endMinutes] = this.settings.workingHours.end.split(':').map(Number);
  const endTimeInMinutes = endHours * 60 + endMinutes;
  
  return timeInMinutes >= startTimeInMinutes && timeInMinutes <= endTimeInMinutes;
};

// Static methods
departmentSchema.statics.findByCompany = function(companyId, options = {}) {
  const query = { companyId };
  
  if (options.status) {
    query.status = options.status;
  }
  
  return this.find(query)
    .populate('managerId', 'firstName lastName email avatar')
    .sort(options.sort || { name: 1 });
};

departmentSchema.statics.findActiveByCompany = function(companyId) {
  return this.find({ companyId, status: 'active' })
    .populate('managerId', 'firstName lastName email avatar')
    .sort({ name: 1 });
};

departmentSchema.statics.findByManager = function(managerId) {
  return this.find({ managerId })
    .populate('companyId', 'name domain')
    .sort({ name: 1 });
};

departmentSchema.statics.updateAllEmployeeCounts = async function() {
  const departments = await this.find({});
  
  for (const department of departments) {
    await department.updateEmployeeCount();
  }
};

// Pre-save middleware
departmentSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.name = this.name.trim();
  }

  if (this.isModified('description')) {
    this.description = this.description.trim();
  }

  // Sync headId with managerId if headId is not set
  if (this.isModified('managerId') && this.managerId && !this.headId) {
    this.headId = this.managerId.toString();
  }

  // Sync memberCount with memberIds length
  if (this.isModified('memberIds')) {
    this.memberCount = this.memberIds ? this.memberIds.length : 0;
  }

  next();
});

// Pre-remove middleware
departmentSchema.pre('remove', async function(next) {
  const User = mongoose.model('User');
  
  // Update all users in this department to remove department association
  await User.updateMany(
    { departmentId: this._id },
    { departmentId: null }
  );
  
  next();
});

// Helper function to update company statistics
const updateCompanyStats = async function(companyId) {
  if (!companyId) return;
  
  try {
    const Company = mongoose.model('Company');
    const company = await Company.findById(companyId);
    if (company) {
      await company.updateStats();
    }
  } catch (error) {
    console.error('Error updating company stats:', error);
  }
};

// Post-save middleware to update company statistics
departmentSchema.post('save', async function(doc) {
  if (doc.companyId) {
    await updateCompanyStats(doc.companyId);
  }
});

// Post-remove middleware to update company statistics
departmentSchema.post('remove', async function(doc) {
  if (doc.companyId) {
    await updateCompanyStats(doc.companyId);
  }
});

// Post-findOneAndUpdate middleware to update company statistics
departmentSchema.post('findOneAndUpdate', async function(doc) {
  if (doc && doc.companyId) {
    await updateCompanyStats(doc.companyId);
  }
});

// Post-findOneAndDelete middleware to update company statistics
departmentSchema.post('findOneAndDelete', async function(doc) {
  if (doc && doc.companyId) {
    await updateCompanyStats(doc.companyId);
  }
});

module.exports = mongoose.model('Department', departmentSchema);











