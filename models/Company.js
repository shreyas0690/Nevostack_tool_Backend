const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  domain: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  logo: {
    url: {
      type: String,
      default: ''
    },
    publicId: {
      type: String,
      default: ''
    },
    uploadedAt: {
      type: Date,
      default: null
    }
  },
  industry: {
    type: String,
    trim: true,
    default: 'Technology'
  },
  employeeCount: {
    type: Number,
    default: 1
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  subscription: {
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: true
    },
    planName: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'cancelled', 'trial', 'expired'],
      default: 'trial'
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date
    },
    trialEndsAt: {
      type: Date
    },
    features: [{
      type: String
    }],
    billingCycle: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly'],
      default: 'monthly'
    },
    amount: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'INR'
    },
    paymentMethod: {
      type: String,
      default: 'card'
    },
    paymentGateway: {
      type: String,
      default: 'razorpay'
    },
    autoRenewal: {
      type: Boolean,
      default: true
    },
    nextBillingDate: {
      type: Date
    }
  },
  billing: {
    currentBillingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Billing'
    },
    lastPaymentDate: {
      type: Date
    },
    lastPaymentAmount: {
      type: Number,
      default: 0
    },
    lastPaymentCurrency: {
      type: String,
      default: 'INR'
    },
    totalPaid: {
      type: Number,
      default: 0
    },
    paymentHistory: [{
      billingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Billing'
      },
      amount: Number,
      currency: String,
      paidAt: Date,
      status: String
    }]
  },
  settings: {
    theme: {
      type: String,
      enum: ['default', 'dark', 'custom'],
      default: 'default'
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    language: {
      type: String,
      default: 'en'
    },
    dateFormat: {
      type: String,
      default: 'MM/DD/YYYY'
    },
    timeFormat: {
      type: String,
      enum: ['12h', '24h'],
      default: '12h'
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
    },
    security: {
      twoFactorRequired: {
        type: Boolean,
        default: false
      },
      passwordPolicy: {
        minLength: {
          type: Number,
          default: 8
        },
        requireUppercase: {
          type: Boolean,
          default: true
        },
        requireLowercase: {
          type: Boolean,
          default: true
        },
        requireNumbers: {
          type: Boolean,
          default: true
        },
        requireSpecialChars: {
          type: Boolean,
          default: false
        }
      },
      sessionTimeout: {
        type: Number,
        default: 30 // minutes
      },
      maxLoginAttempts: {
        type: Number,
        default: 5
      },
      lockoutDuration: {
        type: Number,
        default: 30 // minutes
      }
    },
    features: {
      attendance: {
        type: Boolean,
        default: true
      },
      leaveManagement: {
        type: Boolean,
        default: true
      },
      taskManagement: {
        type: Boolean,
        default: true
      },
      meetingScheduler: {
        type: Boolean,
        default: true
      },
      deviceTracking: {
        type: Boolean,
        default: true
      },
      reports: {
        type: Boolean,
        default: true
      },
      notifications: {
        type: Boolean,
        default: true
      }
    }
  },
  features: {
    taskManagement: {
      type: Boolean,
      default: false
    },
    leaveManagement: {
      type: Boolean,
      default: false
    },
    meetings: {
      type: Boolean,
      default: false
    },
    analytics: {
      type: Boolean,
      default: false
    },
    reports: {
      type: Boolean,
      default: false
    },
    attendance: {
      type: Boolean,
      default: false
    },
    apiAccess: {
      type: Boolean,
      default: false
    },
    customBranding: {
      type: Boolean,
      default: false
    }
  },
  limits: {
    maxUsers: {
      type: Number,
      default: 10
    },
    maxDepartments: {
      type: Number,
      default: 5
    },
    maxDevicesPerUser: {
      type: Number,
      default: 5
    },
    storageLimit: {
      type: Number,
      default: 1024 // MB
    },
    apiRateLimit: {
      type: Number,
      default: 1000 // requests per hour
    }
  },
  stats: {
    totalUsers: {
      type: Number,
      default: 0
    },
    activeUsers: {
      type: Number,
      default: 0
    },
    totalDepartments: {
      type: Number,
      default: 0
    },
    lastActivity: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true
});

// Indexes
// Unique indexes already defined in schema fields
companySchema.index({ status: 1 });
companySchema.index({ 'subscription.status': 1 });
companySchema.index({ createdAt: 1 });

// Instance methods
companySchema.methods.updateStats = async function() {
  const User = mongoose.model('User');
  const Department = mongoose.model('Department');
  
  const totalUsers = await User.countDocuments({ companyId: this._id });
  const activeUsers = await User.countDocuments({ 
    companyId: this._id, 
    status: 'active' 
  });
  const totalDepartments = await Department.countDocuments({ companyId: this._id });
  
  this.stats = {
    totalUsers,
    activeUsers,
    totalDepartments,
    lastActivity: new Date()
  };
  
  return this.save();
};

companySchema.methods.isSubscriptionActive = function() {
  if (this.subscription.status !== 'active') {
    return false;
  }
  
  if (this.subscription.endDate && new Date() > this.subscription.endDate) {
    return false;
  }
  
  return true;
};

companySchema.methods.canAddUser = function() {
  return this.stats.totalUsers < this.limits.maxUsers;
};

companySchema.methods.canAddDepartment = function() {
  return this.stats.totalDepartments < this.limits.maxDepartments;
};

companySchema.methods.getFeatureAccess = function(feature) {
  if (!this.settings.features[feature]) {
    return false;
  }
  
  return this.isSubscriptionActive();
};

// Static methods
companySchema.statics.findByDomain = function(domain) {
  return this.findOne({ domain: domain.toLowerCase() });
};

companySchema.statics.findActive = function() {
  return this.find({ 
    status: 'active',
    'subscription.status': 'active'
  });
};

companySchema.statics.getExpiredSubscriptions = function() {
  return this.find({
    'subscription.endDate': { $lt: new Date() },
    'subscription.status': 'active'
  });
};

companySchema.statics.updateAllStats = async function() {
  const companies = await this.find({});
  
  for (const company of companies) {
    await company.updateStats();
  }
};

// Pre-save middleware
companySchema.pre('save', function(next) {
  if (this.isModified('domain')) {
    this.domain = this.domain.toLowerCase();
  }
  
  if (this.isModified('email')) {
    this.email = this.email.toLowerCase();
  }
  
  next();
});

// Pre-remove middleware
companySchema.pre('remove', async function(next) {
  const User = mongoose.model('User');
  const Department = mongoose.model('Department');
  
  // Delete all users and departments associated with this company
  await User.deleteMany({ companyId: this._id });
  await Department.deleteMany({ companyId: this._id });
  
  next();
});

module.exports = mongoose.model('Company', companySchema);



