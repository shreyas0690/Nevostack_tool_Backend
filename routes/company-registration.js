const express = require('express');
const bcrypt = require('bcryptjs');
const { Company, User } = require('../models');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const Billing = require('../models/Billing');
const Payment = require('../models/Payment');
const Coupon = require('../models/Coupon');
const RazorpayService = require('../services/razorpayService');
const cloudinaryService = require('../services/cloudinaryService');
const { sendWelcomeEmail, sendPaymentConfirmationEmail } = require('../services/emailService');
const { body, validationResult } = require('express-validator');

// Helper function to get billing period days
function getBillingPeriodDays(billingCycle) {
  switch (billingCycle) {
    case 'monthly': return 30;
    case 'quarterly': return 90;
    case 'yearly': return 365;
    default: return 30;
  }
}

// Helper function to generate unique username
async function generateUniqueUsername(email) {
  const baseUsername = email.split('@')[0];
  let username = baseUsername;
  let counter = 1;
  
  while (true) {
    const existingUser = await User.findOne({ username: username });
    if (!existingUser) {
      return username;
    }
    username = `${baseUsername}${counter}`;
    counter++;
  }
}

const router = express.Router();

// Logo upload endpoint for company registration
router.post('/upload-logo', cloudinaryService.getLogoUploadMiddleware(), async (req, res) => {
  try {
    console.log('🖼️ Logo upload request received');

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No logo file provided'
      });
    }

    console.log('✅ Logo uploaded successfully:', {
      url: req.file.path,
      publicId: req.file.filename,
      size: req.file.size
    });

    res.json({
      success: true,
      message: 'Logo uploaded successfully',
      data: {
        url: req.file.path,
        publicId: req.file.filename,
        uploadedAt: new Date()
      }
    });
  } catch (error) {
    console.error('❌ Logo upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload logo',
      error: error.message
    });
  }
});

// Public Plans Endpoint (for company registration)
router.get('/plans', async (req, res) => {
  try {
    console.log('📋 Public plans endpoint requested');
    const plans = await Plan.find({ isActive: true }).sort({ price: 1 });
    console.log('📋 Found active plans:', plans.length);
    console.log('📋 Plans data:', plans.map(p => ({
      id: p._id,
      name: p.displayName,
      prices: p.price
    })));
    res.json({
      success: true,
      data: plans
    });
  } catch (error) {
    console.error('❌ Error fetching public plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch plans',
      error: error.message
    });
  }
});

// Debug endpoint to check plan data
router.get('/debug/plan/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const plan = await Plan.findById(planId);
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }
    
    res.json({
      success: true,
      plan: {
        id: plan._id,
        name: plan.displayName,
        prices: plan.price,
        isActive: plan.isActive
      }
    });
  } catch (error) {
    console.error('Error fetching plan debug info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch plan debug info',
      error: error.message
    });
  }
});

// Create Payment Order for Registration
router.post('/create-payment-order', [
  // Validation middleware
  body('planId').isMongoId().withMessage('Invalid plan ID'),
  body('billingCycle').isIn(['monthly', 'quarterly', 'yearly']).withMessage('Invalid billing cycle'),
  body('couponCode').optional().custom((value) => {
    if (value !== null && value !== undefined && typeof value !== 'string') {
      throw new Error('Coupon code must be a string');
    }
    return true;
  }),
  // Company validation
  body('name').notEmpty().trim().withMessage('Company name is required'),
  body('domain').notEmpty().trim().withMessage('Company domain is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid company email is required'),
  body('phone').optional().isMobilePhone('any').withMessage('Invalid phone number'),
  body('city').notEmpty().trim().withMessage('City is required'),
  body('country').notEmpty().trim().withMessage('Country is required'),
  // Logo validation (optional)
  body('logoUrl').optional().isURL().withMessage('Invalid logo URL'),
  body('logoPublicId').optional().isString().withMessage('Invalid logo public ID'),
  // Admin validation
  body('adminFirstName').notEmpty().trim().withMessage('Admin first name is required'),
  body('adminLastName').notEmpty().trim().withMessage('Admin last name is required'),
  body('adminEmail').isEmail().normalizeEmail().withMessage('Valid admin email is required'),
  body('adminPassword').isLength({ min: 8 }).withMessage('Admin password must be at least 8 characters'),
  body('adminConfirmPassword').custom((value, { req }) => {
    if (value !== req.body.adminPassword) {
      throw new Error('Password confirmation does not match');
    }
    return true;
  })
], async (req, res) => {
  try {
    console.log('🏢 Company registration payment order request received:', {
      planId: req.body.planId,
      billingCycle: req.body.billingCycle,
      couponCode: req.body.couponCode,
      couponCodeType: typeof req.body.couponCode,
      hasCouponCode: req.body.couponCode !== null && req.body.couponCode !== undefined
    });

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      planId,
      billingCycle,
      couponCode = null, // Default to null if not provided
      // Company data
      name,
      domain,
      email,
      phone,
      street,
      city,
      state,
      country,
      zipCode,
      // Logo data
      logoUrl,
      logoPublicId,
      // Admin data
      adminFirstName,
      adminLastName,
      adminEmail,
      adminPassword,
      adminConfirmPassword
    } = req.body;

    console.log('🔍 Validating data before payment...');

    // Get plan details
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    if (!plan.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Plan is not active'
      });
    }

    // Validate coupon if provided
    let coupon = null;
    let discountAmount = 0;
    let finalAmount = plan.price[billingCycle];
    
    console.log('🎫 Coupon code received:', couponCode || 'none');
    console.log('🎫 Plan price for billing cycle:', {
      billingCycle,
      amount: plan.price[billingCycle],
      planPrices: plan.price
    });
    
    // Validate plan price structure
    if (!plan.price || !plan.price[billingCycle]) {
      console.error('❌ Plan price not found for billing cycle:', {
        planId,
        billingCycle,
        availablePrices: plan.price
      });
      return res.status(400).json({
        success: false,
        message: `Plan price not found for ${billingCycle} billing cycle`
      });
    }
    
    if (couponCode) {
      console.log('🎫 Validating coupon:', couponCode);
      console.log('🎫 Plan details:', {
        planId,
        billingCycle,
        originalAmount: plan.price[billingCycle]
      });
      
      coupon = await Coupon.findByCode(couponCode);
      
      if (!coupon) {
        console.log('❌ Coupon not found:', couponCode);
        return res.status(400).json({
          success: false,
          message: 'Invalid coupon code'
        });
      }
      
      console.log('🎫 Coupon found:', {
        code: coupon.code,
        isValid: coupon.isValid(),
        applicablePlans: coupon.applicablePlans,
        minimumOrderAmount: coupon.minimumOrderAmount,
        usageLimit: coupon.usageLimit,
        usedCount: coupon.usedCount
      });
      
      if (!coupon.isValid()) {
        console.log('❌ Coupon is not valid');
        return res.status(400).json({
          success: false,
          message: 'Coupon is not valid or has expired'
        });
      }
      
      // Check if plan is applicable for this coupon
      if (coupon.applicablePlans.length > 0 && 
          !coupon.applicablePlans.some(id => id.toString() === planId)) {
        console.log('❌ Plan not applicable for coupon:', {
          planId,
          applicablePlans: coupon.applicablePlans
        });
        return res.status(400).json({
          success: false,
          message: 'This coupon is not applicable for the selected plan'
        });
      }
      
      // Check minimum order amount
      if (finalAmount < coupon.minimumOrderAmount) {
        console.log('❌ Minimum order amount not met:', {
          finalAmount,
          minimumOrderAmount: coupon.minimumOrderAmount
        });
        return res.status(400).json({
          success: false,
          message: `Minimum order amount for this coupon is ₹${coupon.minimumOrderAmount}`
        });
      }
      
      // Calculate discount
      discountAmount = coupon.calculateDiscount(finalAmount, planId);
      finalAmount = finalAmount - discountAmount;
      
      console.log('✅ Coupon validated:', {
        code: coupon.code,
        originalAmount: plan.price[billingCycle],
        discountAmount,
        finalAmount,
        billingCycle
      });
    } else {
      console.log('✅ No coupon provided, using original amount:', {
        originalAmount: plan.price[billingCycle],
        finalAmount,
        billingCycle
      });
    }

    // Check if company already exists with specific error messages
    console.log('🔍 Checking for existing company data...');
    
    // Check company name
    const existingCompanyByName = await Company.findOne({ name: name });
    if (existingCompanyByName) {
      return res.status(400).json({
        success: false,
        message: `Company name "${name}" is already registered. Please choose a different company name.`,
        errorType: 'duplicate_company_name',
        field: 'name'
      });
    }

    // Check company domain
    const existingCompanyByDomain = await Company.findOne({ domain: domain });
    if (existingCompanyByDomain) {
      return res.status(400).json({
        success: false,
        message: `Domain "${domain}" is already registered. Please choose a different domain.`,
        errorType: 'duplicate_domain',
        field: 'domain'
      });
    }

    // Check company email
    const existingCompanyByEmail = await Company.findOne({ email: email });
    if (existingCompanyByEmail) {
      return res.status(400).json({
        success: false,
        message: `Company email "${email}" is already registered. Please use a different email address.`,
        errorType: 'duplicate_company_email',
        field: 'email'
      });
    }

    // Check if admin user already exists
    console.log('🔍 Checking for existing admin user...');
    const existingUser = await User.findOne({ email: adminEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: `Admin email "${adminEmail}" is already registered. Please use a different email address.`,
        errorType: 'duplicate_admin_email',
        field: 'adminEmail'
      });
    }

    // Admin email uniqueness already checked above

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid domain format'
      });
    }

    // Note: Company email and admin email can have the same domain
    // This is allowed as companies often use their own domain for admin emails

    console.log('✅ All validations passed, proceeding with payment...');

    const amount = finalAmount; // Use final amount after coupon discount
    const receipt = `reg_${Date.now().toString().slice(-6)}_${planId.toString().slice(-6)}`;

    // Validate final amount
    if (amount === null || amount === undefined || amount < 0) {
      console.error('❌ Invalid final amount:', {
        originalAmount: plan.price[billingCycle],
        discountAmount,
        finalAmount: amount,
        billingCycle
      });
      return res.status(400).json({
        success: false,
        message: 'Invalid payment amount. Please contact support.'
      });
    }

    // Handle free plans (amount = 0)
    if (amount === 0) {
      console.log('✅ Free plan detected, skipping Razorpay order creation');
      return res.json({
        success: true,
        data: {
          orderId: `free_${Date.now()}`,
          amount: 0,
          currency: 'INR',
          receipt: receipt,
          isFreePlan: true
        }
      });
    }

    // Create Razorpay order
    console.log('Creating Razorpay order:', { 
      originalAmount: plan.price[billingCycle],
      discountAmount,
      finalAmount: amount, 
      currency: 'INR', 
      receipt, 
      receiptLength: receipt.length,
      couponCode: coupon?.code || 'none'
    });
    const orderResult = await RazorpayService.createOrder(amount, 'INR', receipt);
    
    if (!orderResult.success) {
      console.error('Razorpay order creation failed:', orderResult.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment order',
        error: orderResult.error
      });
    }
    
    console.log('Razorpay order created successfully:', orderResult.data.id);

    res.json({
      success: true,
      message: 'Data validated successfully, payment order created',
      data: {
        orderId: orderResult.data.id,
        amount: orderResult.data.amount,
        currency: orderResult.data.currency,
        receipt: orderResult.data.receipt,
        plan: {
          id: plan._id,
          name: plan.displayName,
          description: plan.description,
          amount: amount,
          originalAmount: plan.price[billingCycle],
          discountAmount,
          coupon: coupon ? {
            code: coupon.code,
            name: coupon.name,
            type: coupon.type,
            value: coupon.value
          } : null,
          billingCycle: billingCycle
        },
        validation: {
          companyName: name,
          domain: domain,
          adminEmail: adminEmail,
          planName: plan.displayName,
          amount: amount
        }
      }
    });
  } catch (error) {
    console.error('Error creating payment order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.message
    });
  }
});

// Verify Payment and Complete Registration
router.post('/verify-payment', async (req, res) => {
  try {
    const {
      orderId,
      paymentId,
      signature,
      planId,
      billingCycle,
      couponCode,
      // Company details
      name,
      domain,
      email,
      phone,
      street,
      city,
      state,
      country,
      zipCode,
      // Logo data
      logoUrl,
      logoPublicId,
      // Admin details
      adminFirstName,
      adminLastName,
      adminEmail,
      adminPassword,
      adminConfirmPassword,
      // Settings
      timezone,
      language,
      dateFormat,
      timeFormat,
      theme
    } = req.body;

    // Verify payment signature
    const isPaymentVerified = RazorpayService.verifyPaymentSignature(orderId, paymentId, signature);
    if (!isPaymentVerified) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    // Get payment details from Razorpay
    const paymentDetails = await RazorpayService.getPaymentDetails(paymentId);
    if (!paymentDetails.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to verify payment details'
      });
    }

    // Get plan details
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    const subscriptionAmount = plan.price[billingCycle];

    // Check if company already exists with specific error messages
    console.log('🔍 Checking for existing company data (free plan)...');
    
    // Check company name
    const existingCompanyByName = await Company.findOne({ name: name });
    if (existingCompanyByName) {
      return res.status(400).json({
        success: false,
        message: `Company name "${name}" is already registered. Please choose a different company name.`,
        errorType: 'duplicate_company_name',
        field: 'name'
      });
    }

    // Check company domain
    const existingCompanyByDomain = await Company.findOne({ domain: domain });
    if (existingCompanyByDomain) {
      return res.status(400).json({
        success: false,
        message: `Domain "${domain}" is already registered. Please choose a different domain.`,
        errorType: 'duplicate_domain',
        field: 'domain'
      });
    }

    // Check company email
    const existingCompanyByEmail = await Company.findOne({ email: email });
    if (existingCompanyByEmail) {
      return res.status(400).json({
        success: false,
        message: `Company email "${email}" is already registered. Please use a different email address.`,
        errorType: 'duplicate_company_email',
        field: 'email'
      });
    }

    // Check if admin user already exists
    console.log('🔍 Checking for existing admin user (free plan)...');
    const existingUser = await User.findOne({ email: adminEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: `Admin email "${adminEmail}" is already registered. Please use a different email address.`,
        errorType: 'duplicate_admin_email',
        field: 'adminEmail'
      });
    }

    // Create company
    const company = new Company({
      name,
      domain,
      email,
      phone: phone || '',
      logo: logoUrl && logoPublicId ? {
        url: logoUrl,
        publicId: logoPublicId,
        uploadedAt: new Date()
      } : undefined,
      employeeCount: 1, // Start with 1 employee (admin)
      address: {
        street: street || '',
        city,
        state: state || '',
        country,
        zipCode: zipCode || ''
      },
      status: 'active',
      settings: {
        theme: theme || 'default',
        timezone: timezone || 'UTC',
        language: language || 'en',
        dateFormat: dateFormat || 'MM/DD/YYYY',
        timeFormat: timeFormat || '12h',
        notifications: {
          email: true,
          push: true,
          sms: false
        },
        security: {
          twoFactorRequired: false,
          passwordPolicy: {
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: false
          },
          sessionTimeout: 8,
          maxLoginAttempts: 5
        }
      },
      subscription: {
        planId: plan._id,
        planName: plan.displayName,
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + getBillingPeriodDays(billingCycle) * 24 * 60 * 60 * 1000),
        features: plan.getEnabledFeatures(),
        billingCycle,
        amount: subscriptionAmount,
        currency: 'INR',
        paymentMethod: 'card',
        paymentGateway: 'razorpay',
        autoRenewal: true,
        nextBillingDate: new Date(Date.now() + getBillingPeriodDays(billingCycle) * 24 * 60 * 60 * 1000)
      },
      billing: {
        lastPaymentDate: new Date(),
        lastPaymentAmount: subscriptionAmount,
        lastPaymentCurrency: 'INR',
        totalPaid: 0, // Will be updated after payment processing
        paymentHistory: []
      },
      limits: {
        maxUsers: plan.limits.maxUsers,
        maxStorage: plan.limits.storageGB,
        maxDepartments: plan.limits.maxDepartments,
        maxProjects: plan.limits.maxUsers > 100 ? -1 : 50
      },
      features: plan.features
    });

    await company.save();
    console.log('✅ Company created:', company.name);

    // Record coupon usage if coupon was applied
    if (couponCode) {
      try {
        console.log('🎫 Recording coupon usage for:', couponCode);
        const coupon = await Coupon.findByCode(couponCode);
        if (coupon) {
          const originalAmount = plan.price[billingCycle];
          const discountAmount = coupon.calculateDiscount(originalAmount, planId);
          
          // Record usage
          const appliedDiscount = coupon.applyCoupon(
            null, // userId (will be set when admin user is created)
            company._id, // companyId
            orderId, // orderId
            originalAmount, // originalAmount
            planId // planId
          );
          
          // Save the coupon with updated usage
          await coupon.save();
          
          console.log('✅ Coupon usage recorded:', {
            couponCode: coupon.code,
            companyId: company._id,
            discountAmount: appliedDiscount,
            originalAmount,
            usedCount: coupon.usedCount,
            usageHistoryLength: coupon.usageHistory.length
          });
        } else {
          console.log('⚠️ Coupon not found for usage tracking:', couponCode);
        }
      } catch (error) {
        console.error('❌ Error recording coupon usage:', error);
        // Don't fail the registration if coupon tracking fails
      }
    }

    // Create subscription
    const subscription = new Subscription({
      companyId: company._id,
      planId: plan._id,
      status: 'active', // Since payment is verified, start as active
      billingCycle,
      startDate: new Date(),
      endDate: new Date(Date.now() + getBillingPeriodDays(billingCycle) * 24 * 60 * 60 * 1000),
      nextBillingDate: new Date(Date.now() + getBillingPeriodDays(billingCycle) * 24 * 60 * 60 * 1000),
      amount: subscriptionAmount,
      currency: 'INR',
      autoRenewal: true,
      paymentMethod: 'card',
      paymentGateway: 'razorpay',
      gatewayCustomerId: paymentDetails.data.customer_id,
      gatewaySubscriptionId: paymentDetails.data.subscription_id,
      features: plan.getEnabledFeatures(),
      limits: plan.limits
    });

    await subscription.save();
    console.log('✅ Subscription created for company:', company.name);

    // Create billing record
    const billing = new Billing({
      companyId: company._id,
      subscriptionId: subscription._id,
      planId: plan._id,
      billingCycle,
      amount: subscriptionAmount,
      currency: 'INR',
      status: 'paid',
      paymentMethod: 'card',
      paymentGateway: 'razorpay',
      gatewayTransactionId: paymentId,
      gatewayOrderId: orderId,
      gatewayPaymentId: paymentId,
      invoiceNumber: Billing.generateInvoiceNumber(),
      dueDate: new Date(),
      paidAt: new Date()
    });

    await billing.save();
    console.log('✅ Billing record created');

    // Update company billing info
    company.billing.currentBillingId = billing._id;
    company.billing.lastPaymentDate = new Date();
    company.billing.lastPaymentAmount = subscriptionAmount;
    company.billing.totalPaid += subscriptionAmount;
    company.billing.paymentHistory.push({
      billingId: billing._id,
      amount: subscriptionAmount,
      currency: 'INR',
      paidAt: new Date(),
      status: 'paid'
    });
    await company.save();

    // Create payment record
    const payment = new Payment({
      companyId: company._id,
      subscriptionId: subscription._id,
      billingId: billing._id,
      amount: subscriptionAmount,
      currency: 'INR',
      status: 'completed',
      paymentMethod: 'card',
      paymentGateway: 'razorpay',
      gatewayTransactionId: paymentId,
      gatewayOrderId: orderId,
      gatewayPaymentId: paymentId,
      gatewaySignature: signature,
      gatewayResponse: paymentDetails.data,
      processedAt: new Date()
    });

    await payment.save();
    console.log('✅ Payment record created');

    // Hash admin password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

    // Generate unique username
    const uniqueUsername = await generateUniqueUsername(adminEmail);

    // Create admin user
    const adminUser = new User({
      username: uniqueUsername,
      firstName: adminFirstName,
      lastName: adminLastName,
      email: adminEmail,
      password: hashedPassword,
      role: 'admin',
      companyId: company._id,
      isActive: true,
      emailVerified: true,
      lastLogin: new Date(),
      profile: {
        avatar: '',
        phone: '',
        department: 'Administration',
        position: 'Administrator'
      },
      preferences: {
        theme: theme || 'default',
        language: language || 'en',
        notifications: {
          email: true,
          push: true,
          sms: false
        }
      }
    });

    await adminUser.save();
    console.log('✅ Admin user created:', adminUser.email);

    // Update coupon usage record with userId if coupon was used
    if (couponCode) {
      try {
        const coupon = await Coupon.findByCode(couponCode);
        if (coupon && coupon.usageHistory.length > 0) {
          // Update the last usage record with the userId
          const lastUsage = coupon.usageHistory[coupon.usageHistory.length - 1];
          if (lastUsage.companyId.toString() === company._id.toString()) {
            lastUsage.userId = adminUser._id;
            await coupon.save();
            console.log('✅ Coupon usage updated with userId:', {
              userId: adminUser._id,
              couponCode: coupon.code,
              usageHistoryLength: coupon.usageHistory.length
            });
          }
        }
      } catch (error) {
        console.error('❌ Error updating coupon usage with userId:', error);
        // Don't fail the registration if coupon tracking fails
      }
    }

    // Send payment confirmation email to company email
    try {
      const paymentEmailResult = await sendPaymentConfirmationEmail(
        email, // Company email
        company.name,
        plan.displayName,
        `${adminUser.firstName} ${adminUser.lastName}`,
        subscriptionAmount,
        'INR'
      );
      if (paymentEmailResult.success) {
        console.log('✅ Payment confirmation email sent to company:', email);
      } else {
        console.log('⚠️ Payment confirmation email failed to send:', paymentEmailResult.error);
      }
    } catch (emailError) {
      console.error('❌ Error sending payment confirmation email:', emailError);
      // Don't fail the registration if email fails
    }

    // Send welcome email to admin
    try {
      const welcomeEmailResult = await sendWelcomeEmail(
        adminUser.email, // Admin email
        company.name,
        plan.displayName,
        `${adminUser.firstName} ${adminUser.lastName}`
      );
      if (welcomeEmailResult.success) {
        console.log('✅ Welcome email sent to admin:', adminUser.email);
      } else {
        console.log('⚠️ Welcome email failed to send:', welcomeEmailResult.error);
      }
    } catch (emailError) {
      console.error('❌ Error sending welcome email:', emailError);
      // Don't fail the registration if email fails
    }

    res.status(201).json({
      success: true,
      message: 'Company registered successfully with payment verified',
      data: {
        company: {
          id: company._id,
          name: company.name,
          domain: company.domain,
          email: company.email,
          status: company.status,
          subscription: {
            plan: plan.displayName,
            status: subscription.status,
            billingCycle: subscription.billingCycle,
            amount: subscription.amount,
            nextBillingDate: subscription.nextBillingDate
          }
        },
        admin: {
          id: adminUser._id,
          firstName: adminUser.firstName,
          lastName: adminUser.lastName,
          email: adminUser.email
        },
        payment: {
          id: payment._id,
          amount: payment.amount,
          status: payment.status,
          transactionId: payment.gatewayTransactionId
        }
      }
    });

  } catch (error) {
    console.error('Error in payment verification and registration:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

// Company Registration Endpoint (for free plans)
router.post('/register', [
  // Validation middleware
  body('name').notEmpty().trim().withMessage('Company name is required'),
  body('domain').notEmpty().trim().withMessage('Company domain is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid company email is required'),
  body('city').notEmpty().trim().withMessage('City is required'),
  body('country').notEmpty().trim().withMessage('Country is required'),
  body('adminFirstName').notEmpty().trim().withMessage('Admin first name is required'),
  body('adminLastName').notEmpty().trim().withMessage('Admin last name is required'),
  body('adminEmail').isEmail().normalizeEmail().withMessage('Valid admin email is required'),
  body('adminPassword').isLength({ min: 8 }).withMessage('Admin password must be at least 8 characters'),
  body('plan').isMongoId().withMessage('Invalid plan ID selected'),
  body('billingCycle').isIn(['monthly', 'quarterly', 'yearly']).withMessage('Invalid billing cycle'),
], async (req, res) => {
  try {
    console.log('🏢 Company registration request received:', req.body);

    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      // Company Info
      name,
      domain,
      email,
      phone,

      // Address
      street,
      city,
      state,
      country,
      zipCode,

      // Logo data
      logoUrl,
      logoPublicId,

      // Admin User
      adminFirstName,
      adminLastName,
      adminEmail,
      adminPassword,

      // Subscription
      plan,
      billingCycle,

      // Settings
      timezone,
      language,
      dateFormat,
      timeFormat,
      theme
    } = req.body;

    // Check if company domain or email already exists
    const existingCompany = await Company.findOne({
      $or: [
        { domain: domain },
        { email: email }
      ]
    });

    if (existingCompany) {
      console.log('❌ Company already exists:', existingCompany.domain);
      return res.status(409).json({
        success: false,
        message: 'Company with this domain or email already exists'
      });
    }

    // Check if admin email already exists
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log('❌ Admin email already exists:', adminEmail);
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Fetch plan from database
    const selectedPlan = await Plan.findById(plan);
    if (!selectedPlan) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan selected'
      });
    }

    if (!selectedPlan.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Selected plan is not active'
      });
    }

    const subscriptionAmount = selectedPlan.price[billingCycle];

    // Create company
    const company = new Company({
      name,
      domain,
      email,
      phone: phone || '',
      logo: logoUrl && logoPublicId ? {
        url: logoUrl,
        publicId: logoPublicId,
        uploadedAt: new Date()
      } : undefined,
      employeeCount: 1, // Start with 1 employee (admin)
      address: {
        street: street || '',
        city,
        state: state || '',
        country,
        zipCode: zipCode || ''
      },
      status: 'active',
      settings: {
        theme: theme || 'default',
        timezone: timezone || 'UTC',
        language: language || 'en',
        dateFormat: dateFormat || 'MM/DD/YYYY',
        timeFormat: timeFormat || '12h',
        notifications: {
          email: true,
          push: true,
          sms: false
        },
        security: {
          twoFactorRequired: false,
          passwordPolicy: {
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: false
          },
          sessionTimeout: 8, // 8 hours
          maxLoginAttempts: 5
        }
      },
      subscription: {
        planId: selectedPlan._id,
        planName: selectedPlan.displayName,
        status: 'trial',
        startDate: new Date(),
        endDate: new Date(Date.now() + selectedPlan.trialDays * 24 * 60 * 60 * 1000),
        trialEndsAt: new Date(Date.now() + selectedPlan.trialDays * 24 * 60 * 60 * 1000),
        features: selectedPlan.getEnabledFeatures(),
        billingCycle,
        amount: subscriptionAmount,
        currency: 'INR',
        paymentMethod: 'trial',
        paymentGateway: 'none',
        autoRenewal: false,
        nextBillingDate: new Date(Date.now() + selectedPlan.trialDays * 24 * 60 * 60 * 1000)
      },
      billing: {
        lastPaymentDate: null,
        lastPaymentAmount: 0,
        lastPaymentCurrency: 'INR',
        totalPaid: 0,
        paymentHistory: []
      },
      limits: {
        maxUsers: selectedPlan.limits.maxUsers,
        maxStorage: selectedPlan.limits.storageGB, // GB
        maxDepartments: selectedPlan.limits.maxDepartments,
        maxProjects: selectedPlan.limits.maxUsers > 100 ? -1 : 50 // Unlimited for enterprise, 50 for others
      },
      features: selectedPlan.features
    });

    await company.save();
    console.log('✅ Company created:', company.name);

    // Create subscription
    const Subscription = require('../models/Subscription');
    const subscription = new Subscription({
      companyId: company._id,
      planId: selectedPlan._id,
      status: 'trial',
      billingCycle,
      startDate: new Date(),
      endDate: new Date(Date.now() + getBillingPeriodDays(billingCycle) * 24 * 60 * 60 * 1000),
      nextBillingDate: new Date(Date.now() + getBillingPeriodDays(billingCycle) * 24 * 60 * 60 * 1000),
      trialEndsAt: new Date(Date.now() + selectedPlan.trialDays * 24 * 60 * 60 * 1000),
      amount: subscriptionAmount,
      currency: 'INR',
      features: selectedPlan.getEnabledFeatures(),
      limits: selectedPlan.limits
    });

    await subscription.save();
    console.log('✅ Subscription created for company:', company.name);

    // Hash admin password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

    // Generate unique username
    const uniqueUsername = await generateUniqueUsername(adminEmail);

    // Create admin user
    const adminUser = new User({
      username: uniqueUsername,
      firstName: adminFirstName,
      lastName: adminLastName,
      email: adminEmail,
      password: hashedPassword,
      role: 'admin',
      companyId: company._id,
      status: 'active',
      isEmailVerified: true, // Auto-verify for now
      profile: {
        jobTitle: 'Administrator',
        department: 'Administration',
        phoneNumber: phone || '',
        address: {
          street: street || '',
          city,
          state: state || '',
          country,
          zipCode: zipCode || ''
        }
      },
      preferences: {
        theme: theme || 'default',
        language: language || 'en',
        timezone: timezone || 'UTC',
        dateFormat: dateFormat || 'MM/DD/YYYY',
        timeFormat: timeFormat || '12h',
        notifications: {
          email: true,
          push: true,
          desktop: true,
          sms: false
        }
      },
      permissions: [
        'canManageUsers',
        'canManageDepartments', 
        'canViewReports',
        'canManageSettings',
        'canManageIntegrations'
      ]
    });

    await adminUser.save();
    console.log('✅ Admin user created:', adminUser.email);

    // Send welcome email for free registration
    try {
      const emailResult = await sendWelcomeEmail(
        adminUser.email,
        company.name,
        selectedPlan.displayName,
        `${adminUser.firstName} ${adminUser.lastName}`
      );
      if (emailResult.success) {
        console.log('✅ Welcome email sent to:', adminUser.email);
      } else {
        console.log('⚠️ Welcome email failed to send:', emailResult.error);
      }
    } catch (emailError) {
      console.error('❌ Error sending welcome email:', emailError);
      // Don't fail the registration if email fails
    }

    // Prepare success response
    const responseData = {
      success: true,
      message: 'Company registered successfully',
      data: {
        company: {
          id: company._id,
          name: company.name,
          domain: company.domain,
          email: company.email,
          status: company.status,
          subscription: {
            plan: company.subscription.plan,
            status: company.subscription.status,
            trialEndsAt: company.subscription.endDate,
            features: company.subscription.features
          }
        },
        admin: {
          id: adminUser._id,
          firstName: adminUser.firstName,
          lastName: adminUser.lastName,
          email: adminUser.email,
          role: adminUser.role
        },
        trialInfo: {
          isTrialActive: true,
          trialEndsAt: company.subscription.endDate,
          daysRemaining: 14
        }
      }
    };

    console.log('🎉 Company registration completed successfully');
    res.status(201).json(responseData);

  } catch (error) {
    console.error('❌ Company registration error:', error);
    
    // If there's a duplicate key error, provide a more specific message
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        success: false,
        message: `Company with this ${field} already exists`,
        error: `Duplicate ${field}`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to register company. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get available plans endpoint
router.get('/plans', (req, res) => {
  const plans = [
    {
      id: 'basic',
      name: 'Basic',
      description: 'Perfect for small teams getting started',
      price: { monthly: 29, quarterly: 79, yearly: 290 },
      features: [
        'Up to 25 employees',
        'Basic attendance tracking',
        'Leave management',
        'Task management',
        'Email support',
        'Basic reports'
      ],
      maxUsers: 25,
      storage: '5 GB',
      departments: 5,
      projects: 10
    },
    {
      id: 'pro',
      name: 'Professional',
      description: 'Advanced features for growing businesses',
      price: { monthly: 59, quarterly: 159, yearly: 590 },
      features: [
        'Up to 100 employees',
        'Advanced analytics',
        'Meeting scheduler',
        'Document management',
        'API access',
        'Priority support',
        'Custom reports',
        'Department management'
      ],
      maxUsers: 100,
      storage: '50 GB',
      departments: 20,
      projects: 50,
      popular: true
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'Complete solution for large organizations',
      price: { monthly: 99, quarterly: 269, yearly: 990 },
      features: [
        'Unlimited employees',
        'Advanced security features',
        'Custom integrations',
        'Dedicated account manager',
        'SLA guarantee',
        'White-label options',
        'Custom workflows',
        'Advanced permissions'
      ],
      maxUsers: 'Unlimited',
      storage: '500 GB',
      departments: 'Unlimited',
      projects: 'Unlimited'
    }
  ];

  res.json({
    success: true,
    data: plans
  });
});

module.exports = router;
