const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Billing = require('../models/Billing');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const Plan = require('../models/Plan');
const Company = require('../models/Company');

// Get company billing history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId;
    
    const billingHistory = await Billing.find({ companyId })
      .populate('planId', 'displayName description')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      data: billingHistory
    });
  } catch (error) {
    console.error('Error fetching billing history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch billing history',
      error: error.message
    });
  }
});

// Get current subscription
router.get('/subscription', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId;
    
    const subscription = await Subscription.findOne({ companyId })
      .populate('planId', 'displayName description price features limits')
      .sort({ createdAt: -1 });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No subscription found'
      });
    }

    res.json({
      success: true,
      data: subscription
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription',
      error: error.message
    });
  }
});

// Get upcoming billing
router.get('/upcoming', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId;
    
    const subscription = await Subscription.findOne({ companyId });
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No subscription found'
      });
    }

    const upcomingBilling = await Billing.findOne({
      companyId,
      status: 'pending',
      dueDate: { $gte: new Date() }
    }).populate('planId', 'displayName description');

    res.json({
      success: true,
      data: upcomingBilling
    });
  } catch (error) {
    console.error('Error fetching upcoming billing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch upcoming billing',
      error: error.message
    });
  }
});

// Create payment intent (for Stripe/Razorpay)
router.post('/create-payment-intent', authenticateToken, async (req, res) => {
  try {
    const { billingId } = req.body;
    const companyId = req.user.companyId;

    const billing = await Billing.findOne({ _id: billingId, companyId });
    if (!billing) {
      return res.status(404).json({
        success: false,
        message: 'Billing record not found'
      });
    }

    // Here you would integrate with payment gateway
    // For now, we'll create a mock payment intent
    const paymentIntent = {
      id: `pi_${Date.now()}`,
      amount: billing.amount,
      currency: billing.currency,
      status: 'requires_payment_method',
      client_secret: `pi_${Date.now()}_secret_${Math.random().toString(36).substr(2, 9)}`
    };

    res.json({
      success: true,
      data: paymentIntent
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment intent',
      error: error.message
    });
  }
});

// Process payment
router.post('/process-payment', authenticateToken, async (req, res) => {
  try {
    const { billingId, paymentMethod, gatewayTransactionId } = req.body;
    const companyId = req.user.companyId;

    const billing = await Billing.findOne({ _id: billingId, companyId });
    if (!billing) {
      return res.status(404).json({
        success: false,
        message: 'Billing record not found'
      });
    }

    // Create payment record
    const payment = new Payment({
      companyId,
      subscriptionId: billing.subscriptionId,
      billingId,
      amount: billing.amount,
      currency: billing.currency,
      paymentMethod,
      paymentGateway: 'stripe', // or 'razorpay'
      gatewayTransactionId,
      status: 'completed'
    });

    await payment.save();

    // Update billing status
    billing.status = 'paid';
    billing.paidAt = new Date();
    await billing.save();

    // Update subscription
    const subscription = await Subscription.findById(billing.subscriptionId);
    if (subscription) {
      subscription.status = 'active';
      subscription.nextBillingDate = new Date(Date.now() + getBillingPeriodDays(billing.billingCycle) * 24 * 60 * 60 * 1000);
      await subscription.save();
    }

    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: payment
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process payment',
      error: error.message
    });
  }
});

// Cancel subscription
router.post('/cancel-subscription', authenticateToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const companyId = req.user.companyId;

    const subscription = await Subscription.findOne({ companyId });
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No subscription found'
      });
    }

    subscription.status = 'cancelled';
    subscription.cancellationReason = reason;
    subscription.cancelledAt = new Date();
    subscription.autoRenewal = false;

    await subscription.save();

    res.json({
      success: true,
      message: 'Subscription cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription',
      error: error.message
    });
  }
});

// Get available plans for upgrade
router.get('/plans', authenticateToken, async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true })
      .select('displayName description price features limits trialDays')
      .sort({ price: 1 });

    res.json({
      success: true,
      data: plans
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch plans',
      error: error.message
    });
  }
});

// Upgrade subscription
router.post('/upgrade', authenticateToken, async (req, res) => {
  try {
    const { planId, billingCycle } = req.body;
    const companyId = req.user.companyId;

    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    const currentSubscription = await Subscription.findOne({ companyId });
    if (!currentSubscription) {
      return res.status(404).json({
        success: false,
        message: 'No current subscription found'
      });
    }

    // Calculate new amount
    const newAmount = plan.price[billingCycle];
    const currentAmount = currentSubscription.amount;
    const proratedAmount = Math.round((newAmount - currentAmount) * (getDaysRemainingInCycle(currentSubscription) / getTotalDaysInCycle(currentSubscription.billingCycle)));

    // Create new billing record
    const billing = new Billing({
      companyId,
      subscriptionId: currentSubscription._id,
      planId,
      billingCycle,
      amount: proratedAmount,
      currency: 'INR',
      status: 'pending',
      paymentMethod: currentSubscription.paymentMethod,
      paymentGateway: currentSubscription.paymentGateway,
      gatewayTransactionId: `upgrade_${Date.now()}`,
      invoiceNumber: Billing.generateInvoiceNumber(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    });

    await billing.save();

    res.json({
      success: true,
      message: 'Upgrade initiated successfully',
      data: {
        billing,
        proratedAmount,
        newPlan: plan
      }
    });
  } catch (error) {
    console.error('Error upgrading subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upgrade subscription',
      error: error.message
    });
  }
});

// Helper functions
function getBillingPeriodDays(billingCycle) {
  switch (billingCycle) {
    case 'monthly': return 30;
    case 'quarterly': return 90;
    case 'yearly': return 365;
    default: return 30;
  }
}

function getDaysRemainingInCycle(subscription) {
  const now = new Date();
  const nextBilling = subscription.nextBillingDate;
  return Math.ceil((nextBilling - now) / (1000 * 60 * 60 * 24));
}

function getTotalDaysInCycle(billingCycle) {
  return getBillingPeriodDays(billingCycle);
}

module.exports = router;
