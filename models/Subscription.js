const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'trial', 'expired', 'cancelled', 'suspended', 'pending'],
    default: 'trial'
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'quarterly', 'yearly'],
    required: true
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  nextBillingDate: {
    type: Date,
    required: true
  },
  trialEndsAt: {
    type: Date
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR',
    enum: ['INR', 'USD', 'EUR']
  },
  autoRenewal: {
    type: Boolean,
    default: true
  },
  paymentMethod: {
    type: String,
    enum: ['card', 'upi', 'netbanking', 'wallet', 'bank_transfer']
  },
  paymentGateway: {
    type: String,
    enum: ['stripe', 'razorpay', 'payu', 'paypal']
  },
  gatewayCustomerId: {
    type: String
  },
  gatewaySubscriptionId: {
    type: String
  },
  features: {
    taskManagement: { type: Boolean, default: false },
    leaveManagement: { type: Boolean, default: false },
    meetings: { type: Boolean, default: false },
    analytics: { type: Boolean, default: false },
    reports: { type: Boolean, default: false },
    attendance: { type: Boolean, default: false },
    apiAccess: { type: Boolean, default: false },
    customBranding: { type: Boolean, default: false }
  },
  limits: {
    maxUsers: { type: Number, default: 5 },
    maxDepartments: { type: Number, default: 2 },
    storageGB: { type: Number, default: 1 }
  },
  usage: {
    currentUsers: { type: Number, default: 0 },
    currentDepartments: { type: Number, default: 0 },
    storageUsed: { type: Number, default: 0 }
  },
  cancellationReason: {
    type: String
  },
  cancelledAt: {
    type: Date
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes
SubscriptionSchema.index({ companyId: 1 });
SubscriptionSchema.index({ status: 1 });
SubscriptionSchema.index({ nextBillingDate: 1 });
SubscriptionSchema.index({ endDate: 1 });

// Instance method to check if subscription is active
SubscriptionSchema.methods.isActive = function() {
  return this.status === 'active' && this.endDate > new Date();
};

// Instance method to check if in trial
SubscriptionSchema.methods.isTrial = function() {
  return this.status === 'trial' && this.trialEndsAt && this.trialEndsAt > new Date();
};

// Instance method to get days remaining
SubscriptionSchema.methods.getDaysRemaining = function() {
  const now = new Date();
  const endDate = this.status === 'trial' ? this.trialEndsAt : this.endDate;
  if (!endDate) return 0;
  
  const diffTime = endDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Instance method to get formatted amount
SubscriptionSchema.methods.getFormattedAmount = function() {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: this.currency,
    minimumFractionDigits: 0
  }).format(this.amount);
};

module.exports = mongoose.model('Subscription', SubscriptionSchema);
