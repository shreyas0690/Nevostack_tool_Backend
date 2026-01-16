const mongoose = require('mongoose');

const BillingSchema = new mongoose.Schema({
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
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
    required: true
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'quarterly', 'yearly'],
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
    enum: ['pending', 'paid', 'failed', 'refunded', 'cancelled'],
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
  invoiceNumber: {
    type: String,
    unique: true,
    required: true
  },
  invoiceUrl: {
    type: String
  },
  dueDate: {
    type: Date,
    required: true
  },
  paidAt: {
    type: Date
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
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes
BillingSchema.index({ companyId: 1 });
BillingSchema.index({ subscriptionId: 1 });
BillingSchema.index({ status: 1 });
BillingSchema.index({ dueDate: 1 });
BillingSchema.index({ invoiceNumber: 1 });

// Static method to generate invoice number
BillingSchema.statics.generateInvoiceNumber = function() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const timestamp = Date.now().toString().slice(-6);
  return `INV-${year}${month}${day}-${timestamp}`;
};

// Instance method to get formatted amount
BillingSchema.methods.getFormattedAmount = function() {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: this.currency,
    minimumFractionDigits: 0
  }).format(this.amount);
};

module.exports = mongoose.model('Billing', BillingSchema);
