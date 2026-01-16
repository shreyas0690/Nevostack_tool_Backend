const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Coupon code is required'],
    unique: true,
    uppercase: true,
    trim: true,
    minlength: [3, 'Coupon code must be at least 3 characters'],
    maxlength: [20, 'Coupon code must not exceed 20 characters']
  },
  name: {
    type: String,
    required: [true, 'Coupon name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['percentage', 'fixed', 'free_trial'],
    required: [true, 'Coupon type is required']
  },
  value: {
    type: Number,
    required: [true, 'Coupon value is required'],
    min: [0, 'Coupon value cannot be negative']
  },
  currency: {
    type: String,
    default: 'INR',
    enum: ['INR', 'USD']
  },
  // Usage limits
  usageLimit: {
    type: Number,
    default: null, // null means unlimited
    min: [1, 'Usage limit must be at least 1']
  },
  usedCount: {
    type: Number,
    default: 0,
    min: [0, 'Used count cannot be negative']
  },
  // Per user limits
  usageLimitPerUser: {
    type: Number,
    default: 1,
    min: [1, 'Usage limit per user must be at least 1']
  },
  // Validity period
  validFrom: {
    type: Date,
    required: [true, 'Valid from date is required']
  },
  validUntil: {
    type: Date,
    required: [true, 'Valid until date is required']
  },
  // Plan restrictions
  applicablePlans: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan'
  }],
  // Minimum order amount
  minimumOrderAmount: {
    type: Number,
    default: 0,
    min: [0, 'Minimum order amount cannot be negative']
  },
  // Maximum discount amount (for percentage coupons)
  maximumDiscountAmount: {
    type: Number,
    default: null,
    min: [0, 'Maximum discount amount cannot be negative']
  },
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  // First time user only
  firstTimeUserOnly: {
    type: Boolean,
    default: false
  },
  // Auto-apply
  autoApply: {
    type: Boolean,
    default: false
  },
  // Created by
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Usage tracking
  usageHistory: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company'
    },
    orderId: String,
    discountAmount: Number,
    originalAmount: Number,
    usedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes for better performance
couponSchema.index({ code: 1 });
couponSchema.index({ isActive: 1 });
couponSchema.index({ validFrom: 1, validUntil: 1 });
couponSchema.index({ type: 1 });

// Pre-save middleware to uppercase the code
couponSchema.pre('save', function(next) {
  if (this.isModified('code')) {
    this.code = this.code.toUpperCase();
  }
  next();
});

// Instance methods
couponSchema.methods.isValid = function() {
  const now = new Date();
  return this.isActive && 
         now >= this.validFrom && 
         now <= this.validUntil &&
         (this.usageLimit === null || this.usedCount < this.usageLimit);
};

couponSchema.methods.canBeUsedByUser = function(userId) {
  if (!this.isValid()) return false;
  
  // If userId is null, skip per-user usage check (for company registration)
  if (!userId) return true;
  
  // Check per user usage limit
  const userUsageCount = this.usageHistory.filter(
    usage => usage.userId && usage.userId.toString() === userId.toString()
  ).length;
  
  return userUsageCount < this.usageLimitPerUser;
};

couponSchema.methods.calculateDiscount = function(amount, planId) {
  if (!this.isValid()) return 0;
  
  // Check if plan is applicable
  if (this.applicablePlans.length > 0 && 
      !this.applicablePlans.some(id => id.toString() === planId.toString())) {
    return 0;
  }
  
  // Check minimum order amount
  if (amount < this.minimumOrderAmount) return 0;
  
  let discount = 0;
  
  switch (this.type) {
    case 'percentage':
      discount = (amount * this.value) / 100;
      if (this.maximumDiscountAmount && discount > this.maximumDiscountAmount) {
        discount = this.maximumDiscountAmount;
      }
      break;
    case 'fixed':
      discount = this.value;
      if (discount > amount) {
        discount = amount; // Can't discount more than the amount
      }
      break;
    case 'free_trial':
      discount = amount; // 100% discount for free trial
      break;
  }
  
  return Math.round(discount * 100) / 100; // Round to 2 decimal places
};

couponSchema.methods.applyCoupon = function(userId, companyId, orderId, originalAmount, planId) {
  console.log('🎫 Applying coupon:', {
    couponCode: this.code,
    userId: userId ? userId.toString() : 'null',
    companyId: companyId ? companyId.toString() : 'null',
    orderId,
    originalAmount,
    planId: planId ? planId.toString() : 'null'
  });
  
  if (!this.canBeUsedByUser(userId)) {
    throw new Error('Coupon cannot be used by this user');
  }
  
  const discountAmount = this.calculateDiscount(originalAmount, planId);
  
  if (discountAmount <= 0) {
    throw new Error('Coupon is not applicable for this order');
  }
  
  // Add to usage history
  this.usageHistory.push({
    userId: userId || null,
    companyId: companyId || null,
    orderId: orderId || null,
    discountAmount,
    originalAmount,
    usedAt: new Date()
  });
  
  // Increment used count
  this.usedCount += 1;
  
  console.log('🎫 Coupon applied successfully:', {
    couponCode: this.code,
    discountAmount,
    newUsedCount: this.usedCount,
    usageHistoryLength: this.usageHistory.length
  });
  
  return discountAmount;
};

// Static methods
couponSchema.statics.findValidCoupons = function() {
  const now = new Date();
  return this.find({
    isActive: true,
    validFrom: { $lte: now },
    validUntil: { $gte: now },
    $or: [
      { usageLimit: null },
      { $expr: { $lt: ['$usedCount', '$usageLimit'] } }
    ]
  });
};

couponSchema.statics.findByCode = function(code) {
  return this.findOne({ 
    code: code.toUpperCase(),
    isActive: true 
  });
};

couponSchema.statics.getCouponStats = async function() {
  const totalCoupons = await this.countDocuments();
  const activeCoupons = await this.countDocuments({ isActive: true });
  const expiredCoupons = await this.countDocuments({
    validUntil: { $lt: new Date() }
  });
  const totalUsage = await this.aggregate([
    { $group: { _id: null, totalUsage: { $sum: '$usedCount' } } }
  ]);
  
  return {
    totalCoupons,
    activeCoupons,
    expiredCoupons,
    totalUsage: totalUsage[0]?.totalUsage || 0
  };
};

module.exports = mongoose.model('Coupon', couponSchema);
