const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const streamifier = require('streamifier');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Create storage configuration for company logos
const logoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'nevostack/company-logos',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'svg'],
    transformation: [
      { width: 500, height: 500, crop: 'limit' },
      { quality: 'auto' }
    ],
    public_id: (req, file) => {
      const timestamp = Date.now();
      const companyName = req.body.name ? req.body.name.replace(/[^a-zA-Z0-9]/g, '_') : 'company';
      return `${companyName}_logo_${timestamp}`;
    },
  },
});

// Create multer upload middleware for logos
const uploadLogo = multer({
  storage: logoStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is an image
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

// Function to upload buffer/stream to Cloudinary
const uploadFromBuffer = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'nevostack/company-logos',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'svg'],
        transformation: [
          { width: 500, height: 500, crop: 'limit' },
          { quality: 'auto' }
        ],
        ...options,
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// Function to delete image from Cloudinary
const deleteImage = (publicId) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
};

// Function to update company logo
const updateCompanyLogo = async (companyId, logoUrl, publicId) => {
  const Company = require('../models/Company');

  try {
    const company = await Company.findById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    // Delete old logo if exists
    if (company.logo.publicId) {
      try {
        await deleteImage(company.logo.publicId);
      } catch (error) {
        console.warn('Failed to delete old logo:', error.message);
        // Don't fail the update if old logo deletion fails
      }
    }

    // Update company logo
    company.logo = {
      url: logoUrl,
      publicId: publicId,
      uploadedAt: new Date(),
    };

    await company.save();
    return company.logo;
  } catch (error) {
    throw new Error(`Failed to update company logo: ${error.message}`);
  }
};

// Function to get logo upload middleware
const getLogoUploadMiddleware = () => {
  return uploadLogo.single('logo');
};

module.exports = {
  cloudinary,
  uploadLogo,
  uploadFromBuffer,
  deleteImage,
  updateCompanyLogo,
  getLogoUploadMiddleware,
};