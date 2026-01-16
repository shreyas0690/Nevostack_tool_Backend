const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    required: true
  },
  billingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Billing',
    required: true
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
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['card', 'upi', 'netbanking', 'wallet', 'bank_transfer'],
    required: true
  },
  paymentGateway: {
    type: String,
    enum: ['stripe', 'razorpay', 'payu', 'paypal'],
    required: true
  },
  gatewayTransactionId: {
    type: String,
    required: true
  },
  gatewayOrderId: {
    type: String
  },
  gatewayPaymentId: {
    type: String
  },
  gatewaySignature: {
    type: String
  },
  gatewayResponse: {
    type: mongoose.Schema.Types.Mixed
  },
  failureReason: {
    type: String
  },
  refundAmount: {
    type: Number,
    default: 0
  },
  refundedAt: {
    type: Date
  },
  refundReason: {
    type: String
  },
  processedAt: {
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
PaymentSchema.index({ companyId: 1 });
PaymentSchema.index({ subscriptionId: 1 });
PaymentSchema.index({ billingId: 1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ gatewayTransactionId: 1 });

// Instance method to get formatted amount
PaymentSchema.methods.getFormattedAmount = function() {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: this.currency,
    minimumFractionDigits: 0
  }).format(this.amount);
};

// Instance method to check if payment is successful
PaymentSchema.methods.isSuccessful = function() {
  return this.status === 'completed';
};

// Instance method to check if payment is failed
PaymentSchema.methods.isFailed = function() {
  return this.status === 'failed';
};

module.exports = mongoose.model('Payment', PaymentSchema);
