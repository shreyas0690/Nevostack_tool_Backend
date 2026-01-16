const express = require('express');
const { body, validationResult } = require('express-validator');
const Coupon = require('../models/Coupon');
const Plan = require('../models/Plan');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Debug endpoint to check current user
router.get('/debug/user', authenticateToken, (req, res) => {
  console.log('🔍 Debug User - Full user object:', req.user);
  res.json({
    success: true,
    user: req.user,
    message: 'User debug info'
  });
});

// Debug endpoint to check coupon usage
router.get('/debug/usage/:code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const coupon = await Coupon.findByCode(code);
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }
    
    res.json({
      success: true,
      coupon: {
        code: coupon.code,
        usedCount: coupon.usedCount,
        usageLimit: coupon.usageLimit,
        usageHistory: coupon.usageHistory,
        isActive: coupon.isActive
      },
      message: 'Coupon usage debug info'
    });
  } catch (error) {
    console.error('Debug coupon usage error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching coupon usage',
      error: error.message
    });
  }
});

// Validation middleware
const validateCoupon = [
  body('code').isLength({ min: 3, max: 20 }).withMessage('Code must be 3-20 characters'),
  body('name').notEmpty().withMessage('Name is required'),
  body('type').isIn(['percentage', 'fixed', 'free_trial']).withMessage('Invalid coupon type'),
  body('value').isNumeric().withMessage('Value must be a number'),
  body('validFrom').isISO8601().withMessage('Valid from must be a valid date'),
  body('validUntil').isISO8601().withMessage('Valid until must be a valid date'),
  body('usageLimit').optional().isInt({ min: 1 }).withMessage('Usage limit must be a positive integer'),
  body('usageLimitPerUser').optional().isInt({ min: 1 }).withMessage('Usage limit per user must be a positive integer'),
  body('minimumOrderAmount').optional().isNumeric().withMessage('Minimum order amount must be a number'),
  body('maximumDiscountAmount').optional().isNumeric().withMessage('Maximum discount amount must be a number')
];

// Get all coupons (Admin only)
router.get('/', authenticateToken, requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type } = req.query;
    const skip = (page - 1) * limit;
    
    let filter = {};
    
    if (status === 'active') {
      const now = new Date();
      filter = {
        isActive: true,
        validFrom: { $lte: now },
        validUntil: { $gte: now }
      };
    } else if (status === 'expired') {
      filter = {
        validUntil: { $lt: new Date() }
      };
    } else if (status === 'inactive') {
      filter = {
        isActive: false
      };
    }
    
    if (type) {
      filter.type = type;
    }
    
    const coupons = await Coupon.find(filter)
      .populate('applicablePlans', 'displayName')
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Coupon.countDocuments(filter);
    
    res.json({
      success: true,
      data: {
        coupons,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupons',
      error: error.message
    });
  }
});

// Get coupon by code (Public)
router.get('/validate/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { amount, planId } = req.query;
    
    const coupon = await Coupon.findByCode(code);
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }
    
    if (!coupon.isValid()) {
      return res.status(400).json({
        success: false,
        message: 'Coupon is not valid or has expired'
      });
    }
    
    let discountAmount = 0;
    if (amount && planId) {
      discountAmount = coupon.calculateDiscount(parseFloat(amount), planId);
    }
    
    res.json({
      success: true,
      data: {
        coupon: {
          code: coupon.code,
          name: coupon.name,
          description: coupon.description,
          type: coupon.type,
          value: coupon.value,
          currency: coupon.currency,
          discountAmount,
          validUntil: coupon.validUntil,
          minimumOrderAmount: coupon.minimumOrderAmount,
          maximumDiscountAmount: coupon.maximumDiscountAmount
        }
      }
    });
  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate coupon',
      error: error.message
    });
  }
});

// Create coupon (Admin only) - Temporarily removed role check for testing
router.post('/', authenticateToken, validateCoupon, async (req, res) => {
  console.log('🎫 Creating coupon - User:', req.user);
  console.log('🎫 Creating coupon - Role:', req.user?.role);
  console.log('🎫 Creating coupon - User ID:', req.user?.id);
  
  // Manual role check
  if (!req.user || !['super_admin', 'admin'].includes(req.user.role)) {
    console.log('🎫 Creating coupon - Access denied. User role:', req.user?.role);
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin role required.'
    });
  }
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const {
      code,
      name,
      description,
      type,
      value,
      currency = 'INR',
      usageLimit,
      usageLimitPerUser = 1,
      validFrom,
      validUntil,
      applicablePlans = [],
      minimumOrderAmount = 0,
      maximumDiscountAmount,
      firstTimeUserOnly = false,
      autoApply = false
    } = req.body;
    
    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists'
      });
    }
    
    // Validate dates
    if (new Date(validFrom) >= new Date(validUntil)) {
      return res.status(400).json({
        success: false,
        message: 'Valid until date must be after valid from date'
      });
    }
    
    // Validate value based on type
    if (type === 'percentage' && (value < 1 || value > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Percentage value must be between 1 and 100'
      });
    }
    
    // Validate applicable plans
    if (applicablePlans.length > 0) {
      const validPlans = await Plan.find({ _id: { $in: applicablePlans } });
      if (validPlans.length !== applicablePlans.length) {
        return res.status(400).json({
          success: false,
          message: 'Some applicable plans are invalid'
        });
      }
    }
    
    const coupon = new Coupon({
      code: code.toUpperCase(),
      name,
      description,
      type,
      value,
      currency,
      usageLimit,
      usageLimitPerUser,
      validFrom: new Date(validFrom),
      validUntil: new Date(validUntil),
      applicablePlans,
      minimumOrderAmount,
      maximumDiscountAmount,
      firstTimeUserOnly,
      autoApply,
      createdBy: req.user.id
    });
    
    await coupon.save();
    
    const populatedCoupon = await Coupon.findById(coupon._id)
      .populate('applicablePlans', 'displayName')
      .populate('createdBy', 'firstName lastName email');
    
    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: { coupon: populatedCoupon }
    });
  } catch (error) {
    console.error('Error creating coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create coupon',
      error: error.message
    });
  }
});

// Update coupon (Admin only)
router.put('/:id', authenticateToken, validateCoupon, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    // Manual role check
    if (!req.user || !['super_admin', 'admin'].includes(req.user.role)) {
      console.log('🎫 Updating coupon - Access denied. User role:', req.user?.role);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }
    
    const { id } = req.params;
    const updateData = req.body;
    
    console.log('🎫 Updating coupon - ID:', id);
    console.log('🎫 Updating coupon - Update data:', updateData);
    
    // Don't allow updating code if coupon has been used
    const existingCoupon = await Coupon.findById(id);
    console.log('🎫 Updating coupon - Existing coupon:', {
      id: existingCoupon?._id,
      code: existingCoupon?.code,
      usedCount: existingCoupon?.usedCount
    });
    if (!existingCoupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }
    
    // Only prevent code updates if the code is actually being changed and coupon has been used
    const isCodeBeingChanged = updateData.code && updateData.code.toUpperCase() !== existingCoupon.code;
    console.log('🎫 Updating coupon - Code comparison:', {
      existingCode: existingCoupon.code,
      newCode: updateData.code,
      isCodeBeingChanged: isCodeBeingChanged,
      usedCount: existingCoupon.usedCount
    });
    
    if (existingCoupon.usedCount > 0 && isCodeBeingChanged) {
      console.log('🎫 Updating coupon - Blocking code update for used coupon');
      return res.status(400).json({
        success: false,
        message: 'Cannot update code of a coupon that has been used'
      });
    }
    
    // Check if new code already exists (if code is being updated to a different value)
    if (updateData.code && updateData.code.toUpperCase() !== existingCoupon.code) {
      const codeExists = await Coupon.findOne({ code: updateData.code.toUpperCase() });
      if (codeExists) {
        return res.status(400).json({
          success: false,
          message: 'Coupon code already exists'
        });
      }
    }
    
    // Validate dates
    if (updateData.validFrom && updateData.validUntil) {
      if (new Date(updateData.validFrom) >= new Date(updateData.validUntil)) {
        return res.status(400).json({
          success: false,
          message: 'Valid until date must be after valid from date'
        });
      }
    }
    
    // Update coupon
    const updatedCoupon = await Coupon.findByIdAndUpdate(
      id,
      { ...updateData, code: updateData.code?.toUpperCase() },
      { new: true, runValidators: true }
    ).populate('applicablePlans', 'displayName')
     .populate('createdBy', 'firstName lastName email');
    
    res.json({
      success: true,
      message: 'Coupon updated successfully',
      data: { coupon: updatedCoupon }
    });
  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update coupon',
      error: error.message
    });
  }
});

// Delete coupon (Admin only)
router.delete('/:id', authenticateToken, requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }
    
    // Don't allow deleting coupons that have been used
    if (coupon.usedCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete coupon that has been used. Deactivate it instead.'
      });
    }
    
    await Coupon.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: 'Coupon deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete coupon',
      error: error.message
    });
  }
});

// Toggle coupon status (Admin only)
router.patch('/:id/toggle', authenticateToken, requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }
    
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    
    res.json({
      success: true,
      message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { coupon }
    });
  } catch (error) {
    console.error('Error toggling coupon status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle coupon status',
      error: error.message
    });
  }
});

// Get coupon statistics (Admin only)
router.get('/stats', authenticateToken, requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const stats = await Coupon.getCouponStats();
    
    // Get top used coupons
    const topUsedCoupons = await Coupon.find({ usedCount: { $gt: 0 } })
      .sort({ usedCount: -1 })
      .limit(5)
      .select('code name usedCount type value');
    
    // Get recent usage
    const recentUsage = await Coupon.aggregate([
      { $unwind: '$usageHistory' },
      { $sort: { 'usageHistory.usedAt': -1 } },
      { $limit: 10 },
      { $lookup: {
        from: 'users',
        localField: 'usageHistory.userId',
        foreignField: '_id',
        as: 'user'
      }},
      { $lookup: {
        from: 'companies',
        localField: 'usageHistory.companyId',
        foreignField: '_id',
        as: 'company'
      }},
      { $project: {
        code: 1,
        name: 1,
        'usageHistory.discountAmount': 1,
        'usageHistory.usedAt': 1,
        'user.firstName': 1,
        'user.lastName': 1,
        'company.name': 1
      }}
    ]);
    
    res.json({
      success: true,
      data: {
        ...stats,
        topUsedCoupons,
        recentUsage
      }
    });
  } catch (error) {
    console.error('Error fetching coupon stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupon statistics',
      error: error.message
    });
  }
});

module.exports = router;
