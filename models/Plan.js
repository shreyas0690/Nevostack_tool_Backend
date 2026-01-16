const mongoose = require('mongoose');

const PlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Plan name is required'],
    unique: true,
    trim: true,
    lowercase: true
  },
  displayName: {
    type: String,
    required: [true, 'Display name is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true
  },
  price: {
    monthly: {
      type: Number,
      required: true,
      min: 0
    },
    quarterly: {
      type: Number,
      required: true,
      min: 0
    },
    yearly: {
      type: Number,
      required: true,
      min: 0
    }
  },
  limits: {
    maxUsers: {
      type: Number,
      required: true,
      min: -1  // -1 means unlimited
    },
    maxDepartments: {
      type: Number,
      required: true,
      min: -1  // -1 means unlimited
    },
    storageGB: {
      type: Number,
      required: true,
      min: -1  // -1 means unlimited
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
  trialDays: {
    type: Number,
    default: 0,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPopular: {
    type: Boolean,
    default: false
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  stripePriceId: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Indexes for better performance
PlanSchema.index({ name: 1 });
PlanSchema.index({ isActive: 1 });
PlanSchema.index({ sortOrder: 1 });

// Static method to find active plans
PlanSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ sortOrder: 1 });
};

// Static method to find popular plans
PlanSchema.statics.findPopular = function() {
  return this.find({ isActive: true, isPopular: true }).sort({ sortOrder: 1 });
};

// Instance method to get formatted price
PlanSchema.methods.getFormattedPrice = function() {
  return this.price === 0 ? 'Free' : `₹${this.price}`;
};

// Instance method to get feature list
PlanSchema.methods.getEnabledFeatures = function() {
  return Object.entries(this.features)
    .filter(([key, value]) => value === true)
    .map(([key]) => key);
};

module.exports = mongoose.model('Plan', PlanSchema);