const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  subdomain: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/
  },
  domain: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  plan: {
    type: String,
    enum: ['starter', 'professional', 'enterprise'],
    default: 'starter'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'trial'],
    default: 'trial'
  },
  trialEndsAt: {
    type: Date,
    default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days trial
  },
  subscriptionStartDate: {
    type: Date
  },
  subscriptionEndDate: {
    type: Date
  },
  billing: {
    interval: {
      type: String,
      enum: ['monthly', 'yearly'],
      default: 'monthly'
    },
    amount: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'USD'
    },
    nextBillingDate: Date,
    paymentMethod: String,
    billingHistory: [{
      date: Date,
      amount: Number,
      status: {
        type: String,
        enum: ['paid', 'pending', 'failed'],
        default: 'pending'
      },
      invoiceId: String
    }]
  },
  limits: {
    maxUsers: {
      type: Number,
      default: 10
    },
    maxStorage: {
      type: Number,
      default: 1024 // MB
    },
    maxDepartments: {
      type: Number,
      default: 5
    },
    apiCallsPerMonth: {
      type: Number,
      default: 10000
    }
  },
  usage: {
    currentUsers: {
      type: Number,
      default: 0
    },
    storageUsed: {
      type: Number,
      default: 0
    },
    currentDepartments: {
      type: Number,
      default: 0
    },
    apiCallsThisMonth: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  features: [{
    name: String,
    enabled: {
      type: Boolean,
      default: true
    },
    config: mongoose.Schema.Types.Mixed
  }],
  customization: {
    logo: String,
    primaryColor: {
      type: String,
      default: '#3B82F6'
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light'
    },
    customDomain: String,
    customCss: String
  },
  settings: {
    timezone: {
      type: String,
      default: 'UTC'
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
    language: {
      type: String,
      default: 'en'
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
  },
  integrations: [{
    name: String,
    type: {
      type: String,
      enum: ['api', 'webhook', 'oauth', 'saml']
    },
    config: mongoose.Schema.Types.Mixed,
    enabled: {
      type: Boolean,
      default: false
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
workspaceSchema.index({ subdomain: 1 });
workspaceSchema.index({ domain: 1 });
workspaceSchema.index({ companyId: 1 });
workspaceSchema.index({ ownerId: 1 });
workspaceSchema.index({ status: 1 });
workspaceSchema.index({ plan: 1 });

// Instance methods
workspaceSchema.methods.isTrialExpired = function() {
  return this.status === 'trial' && this.trialEndsAt < new Date();
};

workspaceSchema.methods.isSubscriptionActive = function() {
  if (this.status === 'trial') {
    return !this.isTrialExpired();
  }
  return this.status === 'active' && 
         (!this.subscriptionEndDate || this.subscriptionEndDate > new Date());
};

workspaceSchema.methods.canAddUser = function() {
  return this.usage.currentUsers < this.limits.maxUsers;
};

workspaceSchema.methods.canAddDepartment = function() {
  return this.usage.currentDepartments < this.limits.maxDepartments;
};

workspaceSchema.methods.updateUsage = async function() {
  const User = mongoose.model('User');
  const Department = mongoose.model('Department');
  
  this.usage.currentUsers = await User.countDocuments({ 
    companyId: this.companyId,
    status: 'active'
  });
  
  this.usage.currentDepartments = await Department.countDocuments({ 
    companyId: this.companyId 
  });
  
  this.usage.lastUpdated = new Date();
  return this.save();
};

// Static methods
workspaceSchema.statics.findBySubdomain = function(subdomain) {
  return this.findOne({ subdomain: subdomain.toLowerCase() });
};

workspaceSchema.statics.findByDomain = function(domain) {
  return this.findOne({ domain: domain.toLowerCase() });
};

workspaceSchema.statics.createWorkspace = async function(workspaceData) {
  const workspace = new this({
    ...workspaceData,
    subdomain: workspaceData.subdomain.toLowerCase(),
    domain: workspaceData.domain.toLowerCase()
  });
  
  await workspace.save();
  await workspace.updateUsage();
  
  return workspace;
};

// Pre-save middleware
workspaceSchema.pre('save', function(next) {
  if (this.isModified('subdomain')) {
    this.subdomain = this.subdomain.toLowerCase();
  }
  if (this.isModified('domain')) {
    this.domain = this.domain.toLowerCase();
  }
  next();
});

module.exports = mongoose.model('Workspace', workspaceSchema);













