const Razorpay = require('razorpay');
const razorpayConfig = require('../config/razorpay');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || razorpayConfig.key_id,
  key_secret: process.env.RAZORPAY_KEY_SECRET || razorpayConfig.key_secret
});

class RazorpayService {
  // Create order for payment
  static async createOrder(amount, currency = 'INR', receipt = null) {
    try {
      // Ensure receipt is under 40 characters
      const safeReceipt = receipt && receipt.length <= 40 
        ? receipt 
        : `rcpt_${Date.now().toString().slice(-8)}`;
      
      const options = {
        amount: amount * 100, // Razorpay expects amount in paise
        currency: currency,
        receipt: safeReceipt,
        payment_capture: 1 // Auto capture payment
      };

      console.log('Razorpay order options:', options);
      const order = await razorpay.orders.create(options);
      console.log('Razorpay order created:', order.id);
      
      return {
        success: true,
        data: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
          status: order.status
        }
      };
    } catch (error) {
      console.error('Razorpay order creation error:', error);
      return {
        success: false,
        error: error.message || 'Unknown error occurred'
      };
    }
  }

  // Verify payment signature
  static verifyPaymentSignature(orderId, paymentId, signature) {
    try {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || razorpayConfig.key_secret)
        .update(orderId + '|' + paymentId)
        .digest('hex');

      return expectedSignature === signature;
    } catch (error) {
      console.error('Payment verification error:', error);
      return false;
    }
  }

  // Capture payment
  static async capturePayment(paymentId, amount) {
    try {
      const payment = await razorpay.payments.capture(paymentId, amount * 100);
      return {
        success: true,
        data: payment
      };
    } catch (error) {
      console.error('Payment capture error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get payment details
  static async getPaymentDetails(paymentId) {
    try {
      const payment = await razorpay.payments.fetch(paymentId);
      return {
        success: true,
        data: payment
      };
    } catch (error) {
      console.error('Get payment details error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Create customer
  static async createCustomer(name, email, contact = null) {
    try {
      const customer = await razorpay.customers.create({
        name: name,
        email: email,
        contact: contact
      });
      return {
        success: true,
        data: customer
      };
    } catch (error) {
      console.error('Create customer error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Create subscription
  static async createSubscription(planId, customerId, totalCount = null, startAt = null) {
    try {
      const subscription = await razorpay.subscriptions.create({
        plan_id: planId,
        customer_id: customerId,
        total_count: totalCount,
        start_at: startAt || Math.floor(Date.now() / 1000)
      });
      return {
        success: true,
        data: subscription
      };
    } catch (error) {
      console.error('Create subscription error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Cancel subscription
  static async cancelSubscription(subscriptionId) {
    try {
      const subscription = await razorpay.subscriptions.cancel(subscriptionId);
      return {
        success: true,
        data: subscription
      };
    } catch (error) {
      console.error('Cancel subscription error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get subscription details
  static async getSubscriptionDetails(subscriptionId) {
    try {
      const subscription = await razorpay.subscriptions.fetch(subscriptionId);
      return {
        success: true,
        data: subscription
      };
    } catch (error) {
      console.error('Get subscription details error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Create refund
  static async createRefund(paymentId, amount = null, notes = {}) {
    try {
      const refund = await razorpay.payments.refund(paymentId, {
        amount: amount ? amount * 100 : null, // Amount in paise
        notes: notes
      });
      return {
        success: true,
        data: refund
      };
    } catch (error) {
      console.error('Create refund error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = RazorpayService;
