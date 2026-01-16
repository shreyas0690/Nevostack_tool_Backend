const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    // required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [50, 'Username cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false // Don't include password in query results by default
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  name: {
    type: String,
    trim: true,
    maxlength: [101, 'Full name cannot exceed 101 characters']
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'hr_manager', 'hr', 'department_head', 'manager', 'member', 'person'],
    default: 'person',
    required: [true, 'User role is required']
  },
  // Platform Settings (stored directly on user for SaaS Super Admin)
  platformName: { type: String, default: 'NevoStack SaaS Platform', trim: true },
  platformDomain: { type: String, default: 'nevostack.com', trim: true },
  platformSupportEmail: { type: String, default: 'support@nevostack.com', trim: true },
  platformContactPhone: { type: String, default: '+1 (555) 123-4567', trim: true },
  platformTimezone: { type: String, default: 'UTC', trim: true },
  platformLanguage: { type: String, default: 'en', trim: true },

  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  departmentId: {
    type: String,
    index: true
  },
  manager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  managerId: {
      // type: mongoose.Schema.Types.ObjectId,
      // ref: 'User',
   type: String, 
    index: true
  },
  // For HODs: list of manager user IDs reporting to this HOD
  managedManagerIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // For HODs and Managers: list of member user IDs reporting to this manager/HOD
  managedMemberIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  phone: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || validator.isMobilePhone(v);
      },
      message: 'Please provide a valid phone number'
    }
  },
  mobileNumber: {
    type: String,
    validate: {
      validator: function(v) {
        if (!v) return true; // Allow empty values
        // More lenient validation - just check if it's a string with digits
        return typeof v === 'string' && /^[\+]?[0-9\s\-\(\)]{7,15}$/.test(v);
      },
      message: 'Please provide a valid mobile number'
    }
  },
  avatar: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || validator.isURL(v);
      },
      message: 'Please provide a valid URL for avatar'
    }
  },
  dateOfJoining: {
    type: Date,
    required: [true, 'Date of joining is required'],
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'terminated', 'blocked', 'pending'],
    default: 'active'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  position: {
    type: String,
    trim: true,
    maxlength: [100, 'Position cannot exceed 100 characters']
  },
  salary: {
    type: Number,
    min: [0, 'Salary cannot be negative']
  },
  permissions: [{
    type: String,
    trim: true
  }],
  lastLogin: {
    type: Date
  },
  loginCount: {
    type: Number,
    default: 0
  },
  resetPasswordToken: {
    type: String,
    select: false
  },
  resetPasswordExpires: {
    type: Date,
    select: false
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    select: false
  },
  // Device tracking fields
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  lockedUntil: {
    type: Date,
    default: null
  },
  lastPasswordChange: {
    type: Date,
    default: null
  },
  lastActiveDevice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device'
  },
  securitySettings: {
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    requireDeviceApproval: {
      type: Boolean,
      default: false
    },
    maxActiveDevices: {
      type: Number,
      default: 5
    },
    sessionTimeout: {
      type: Number,
      default: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
    }
  },
  devicePreferences: {
    defaultTheme: {
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
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      }
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
UserSchema.index({ role: 1 });
UserSchema.index({ department: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ manager: 1 });
UserSchema.index({ companyId: 1 });

// Virtual for full name
UserSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for subordinates
UserSchema.virtual('subordinates', {
  ref: 'User',
  localField: '_id',
  foreignField: 'manager'
});

// Pre-save middleware to hash password and update fields
UserSchema.pre('save', async function(next) {
  // Update name field from firstName and lastName
  if (this.isModified('firstName') || this.isModified('lastName')) {
    this.name = `${this.firstName} ${this.lastName}`;
  }

  // Sync isActive with status
  if (this.isModified('status')) {
    this.isActive = this.status === 'active';
  }

  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();

  // Skip if password is already hashed (starts with $2a$, $2b$, or $2y$)
  if (this.password && this.password.startsWith('$2a$') ||
      this.password && this.password.startsWith('$2b$') ||
      this.password && this.password.startsWith('$2y$')) {
    return next();
  }

  try {
    // Hash password with cost of 12
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Instance method to generate reset password token
UserSchema.methods.createPasswordResetToken = function() {
  const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  
  this.resetPasswordToken = resetToken;
  this.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
  return resetToken;
};

// Instance method to generate email verification token
UserSchema.methods.createEmailVerificationToken = function() {
  const verificationToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  
  this.emailVerificationToken = verificationToken;
  
  return verificationToken;
};

// Static method to find users by role
UserSchema.statics.findByRole = function(role) {
  return this.find({ role, status: 'active' });
};

// Static method to find users in department
UserSchema.statics.findByDepartment = function(departmentId) {
  return this.find({ department: departmentId, status: 'active' });
};

// Instance method to increment failed login attempts
UserSchema.methods.incrementFailedLoginAttempts = function() {
  this.failedLoginAttempts += 1;
  
  // Lock account if too many failed attempts
  if (this.failedLoginAttempts >= 5) {
    this.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
  }
  
  return this.save();
};

// Instance method to reset failed login attempts
UserSchema.methods.resetFailedLoginAttempts = function() {
  this.failedLoginAttempts = 0;
  this.lockedUntil = null;
  return this.save();
};

// Instance method to check if account is locked
UserSchema.methods.isLocked = function() {
  return this.lockedUntil && this.lockedUntil > new Date();
};

// Instance method to get active devices count
UserSchema.methods.getActiveDevicesCount = async function() {
  const Device = mongoose.model('Device');
  return await Device.countDocuments({
    userId: this._id,
    isActive: true
  });
};

// Instance method to check if user can add more devices
UserSchema.methods.canAddDevice = async function() {
  const activeDevicesCount = await this.getActiveDevicesCount();
  return activeDevicesCount < this.securitySettings.maxActiveDevices;
};

// Middleware to remove sensitive data before sending response
UserSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.resetPasswordToken;
  delete userObject.resetPasswordExpires;
  delete userObject.emailVerificationToken;
  return userObject;
};

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
UserSchema.post('save', async function(doc) {
  if (doc.companyId) {
    await updateCompanyStats(doc.companyId);
  }
});

// Post-remove middleware to update company statistics
UserSchema.post('remove', async function(doc) {
  if (doc.companyId) {
    await updateCompanyStats(doc.companyId);
  }
});

// Post-findOneAndUpdate middleware to update company statistics
UserSchema.post('findOneAndUpdate', async function(doc) {
  if (doc && doc.companyId) {
    await updateCompanyStats(doc.companyId);
  }
});

// Post-findOneAndDelete middleware to update company statistics
UserSchema.post('findOneAndDelete', async function(doc) {
  if (doc && doc.companyId) {
    await updateCompanyStats(doc.companyId);
  }
});

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
