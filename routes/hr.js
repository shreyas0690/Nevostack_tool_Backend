const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const rateLimit = require('express-rate-limit');
const { User, Company, Department } = require('../models');
const { requireRole } = require('../middleware/auth');

// Configure Cloudinary
const cloudinaryConfig = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 60000 // 60 second timeout
};

// Check if Cloudinary is properly configured
const isCloudinaryConfigured = cloudinaryConfig.cloud_name &&
                               cloudinaryConfig.api_key &&
                               cloudinaryConfig.api_secret;

if (isCloudinaryConfigured) {
  cloudinary.config(cloudinaryConfig);
} else {
  console.warn('⚠️  Cloudinary not configured. Avatar uploads will fail. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file.');
}

// multer memory storage for buffering uploads before streaming to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit for avatars
});

// Helper function to upload buffer to cloudinary
const uploadBufferToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    // Set timeout for the upload
    const timeout = options.timeout || 60000; // 60 seconds default
    const timeoutId = setTimeout(() => {
      reject(new Error(`Upload timeout after ${timeout}ms`));
    }, timeout);

    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      clearTimeout(timeoutId);
      if (error) return reject(error);
      resolve(result);
    });

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

const router = express.Router();

// HR Panel specific rate limiting - Very lenient for dashboard usage
const hrPanelLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1000, // Allow 1000 requests per 5 minutes for HR panel
  message: {
    error: 'Too many HR panel requests, please wait a moment.',
    retryAfter: 5
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply HR panel rate limiter to all hr routes
router.use(hrPanelLimiter);

// @route   GET /api/hr/profile
// @desc    Get HR profile information
// @access  Private (HR only)
router.get('/profile', requireRole(['hr', 'hr_manager']), async (req, res) => {
  try {
    const hrId = req.user.id;

    const hr = await User.findById(hrId)
      .select('-password -resetPasswordToken -resetPasswordExpires -emailVerificationToken')
      .populate('department', 'name color description')
      .populate('companyId', 'name')
      .populate('managedManagerIds', 'firstName lastName email role')
      .populate('managedMemberIds', 'firstName lastName email role');

    if (!hr) {
      return res.status(404).json({ error: 'HR not found' });
    }

    // Verify user is actually HR
    if (hr.role !== 'hr' && hr.role !== 'hr_manager') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only HR users can access this endpoint'
      });
    }

    res.json({
      success: true,
      data: hr
    });
  } catch (err) {
    console.error('HR profile error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// @route   PUT /api/hr/profile/details
// @desc    Update HR profile details
// @access  Private (HR only)
router.put('/profile/details', [
  requireRole(['hr', 'hr_manager']),
  body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
  body('phone').optional().custom((value) => {
    if (!value || value === '' || value === null || value === undefined) {
      return true; // Allow empty values
    }
    return require('validator').isMobilePhone(value);
  }).withMessage('Invalid phone number'),
  body('mobileNumber').optional().custom((value) => {
    if (!value || value === '' || value === null || value === undefined) {
      return true; // Allow empty values
    }
    return require('validator').isMobilePhone(value);
  }).withMessage('Invalid mobile number')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: errors.array()[0].msg,
        details: errors.array()
      });
    }

    const hrId = req.user.id;
    const updateData = req.body;

    // Verify user is HR
    const hr = await User.findById(hrId);
    if (!hr || (hr.role !== 'hr' && hr.role !== 'hr_manager')) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only HR users can update their profile'
      });
    }

    // Remove sensitive fields that shouldn't be updated through this endpoint
    const allowedFields = ['firstName', 'lastName', 'phone', 'mobileNumber'];
    const filteredUpdateData = {};

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        filteredUpdateData[field] = updateData[field];
      }
    });

    // Update name field if firstName or lastName changed
    if (filteredUpdateData.firstName || filteredUpdateData.lastName) {
      const newFirst = filteredUpdateData.firstName || hr.firstName;
      const newLast = filteredUpdateData.lastName || hr.lastName;
      filteredUpdateData.name = `${newFirst} ${newLast}`.trim();
    }

    const updatedHr = await User.findByIdAndUpdate(
      hrId,
      filteredUpdateData,
      { new: true, runValidators: true }
    )
    .select('-password -resetPasswordToken -resetPasswordExpires -emailVerificationToken')
    .populate('department', 'name color')
    .populate('companyId', 'name');

    if (!updatedHr) {
      return res.status(404).json({
        error: 'HR not found',
        message: 'HR user does not exist'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile details updated successfully',
      data: updatedHr
    });

  } catch (error) {
    console.error('Update HR profile details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile details',
      message: error.message || 'Internal server error'
    });
  }
});

// @route   POST /api/hr/profile/avatar
// @desc    Upload HR avatar
// @access  Private (HR only)
router.post('/profile/avatar', requireRole(['hr', 'hr_manager']), upload.single('avatar'), async (req, res) => {
  // Set longer timeout for file uploads
  req.setTimeout(120000); // 2 minutes
  res.setTimeout(120000); // 2 minutes

  try {
    const hrId = req.user.id;

    // Verify user is HR
    const hr = await User.findById(hrId);
    if (!hr || (hr.role !== 'hr' && hr.role !== 'hr_manager')) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only HR users can update their avatar'
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please select an image file'
      });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        error: 'Invalid file type',
        message: 'Only JPEG, PNG, GIF, and WebP images are allowed'
      });
    }

    console.log('Uploading avatar for HR:', hrId, 'file:', req.file.originalname);

    // Check if Cloudinary is configured
    if (!isCloudinaryConfigured) {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'Avatar upload service is not configured. Please contact your administrator to set up Cloudinary credentials.'
      });
    }

    // Upload to Cloudinary
    const uploadOptions = {
      resource_type: 'image',
      folder: 'hr-avatars',
      public_id: `hr-${hrId}-${Date.now()}`,
      timeout: 60000, // 60 second timeout
      transformation: [
        { width: 300, height: 300, crop: 'fill', gravity: 'auto' },
        { quality: 'auto', format: 'jpg' }
      ]
    };

    console.log('Starting Cloudinary upload with options:', uploadOptions);
    const result = await uploadBufferToCloudinary(req.file.buffer, uploadOptions);
    console.log('HR avatar upload successful:', result.secure_url || result.url);

    // Validate the result
    if (!result || !result.secure_url) {
      throw new Error('Cloudinary upload failed - no URL returned');
    }

    // Update HR avatar in database
    hr.avatar = result.secure_url || result.url;
    await hr.save();

    res.json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: {
        avatar: hr.avatar,
        hr: {
          id: hr._id,
          firstName: hr.firstName,
          lastName: hr.lastName,
          avatar: hr.avatar
        }
      }
    });

  } catch (error) {
    console.error('HR avatar upload error:', error);

    // Handle specific error types
    if (error.message && error.message.includes('timeout')) {
      return res.status(408).json({
        error: 'Upload timeout',
        message: 'Upload took too long. Please try with a smaller file or check your connection.'
      });
    }

    if (error.message && error.message.includes('file size')) {
      return res.status(413).json({
        error: 'File too large',
        message: 'File size exceeds the 5MB limit. Please choose a smaller image.'
      });
    }

    res.status(500).json({
      error: 'Upload failed',
      message: error.message || 'Failed to upload avatar. Please try again.'
    });
  }
});

module.exports = router;

