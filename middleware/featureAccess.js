const Company = require('../models/Company');

/**
 * Middleware to check if a company has access to a specific feature
 * @param {string|string[]} requiredFeatures - Feature(s) required to access the route
 * @param {boolean} requireAll - If true, user must have ALL features. If false, user needs ANY feature
 * @returns {Function} Express middleware function
 */
const requireFeature = (requiredFeatures, requireAll = false) => {
  return async (req, res, next) => {
    try {
      // Ensure user is authenticated
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Ensure user has a company
      if (!req.user.companyId) {
        return res.status(400).json({
          success: false,
          message: 'User is not associated with any company'
        });
      }

      // Get company features
      const company = await Company.findById(req.user.companyId);
      if (!company) {
        return res.status(404).json({
          success: false,
          message: 'Company not found'
        });
      }

      // Get features from both settings.features and features fields
      const settingsFeatures = company.settings?.features || {};
      const companyFeatures = company.features || {};

      // Merge features with settings taking precedence
      const mergedFeatures = {
        attendance: settingsFeatures.attendance || companyFeatures.attendance || false,
        leaveManagement: settingsFeatures.leaveManagement || companyFeatures.leaveManagement || false,
        taskManagement: settingsFeatures.taskManagement || companyFeatures.taskManagement || false,
        meetingScheduler: settingsFeatures.meetingScheduler || companyFeatures.meetings || false,
        deviceTracking: settingsFeatures.deviceTracking || false,
        reports: settingsFeatures.reports || companyFeatures.reports || false,
        notifications: settingsFeatures.notifications || false,
        analytics: companyFeatures.analytics || false,
        meetings: companyFeatures.meetings || false,
        apiAccess: companyFeatures.apiAccess || false,
        customBranding: companyFeatures.customBranding || false
      };

      // Normalize required features to array
      const featuresArray = Array.isArray(requiredFeatures) ? requiredFeatures : [requiredFeatures];

      // Check feature access
      let hasAccess = false;
      
      if (requireAll) {
        // User must have ALL required features
        hasAccess = featuresArray.every(feature => mergedFeatures[feature] === true);
      } else {
        // User needs ANY of the required features
        hasAccess = featuresArray.some(feature => mergedFeatures[feature] === true);
      }

      if (!hasAccess) {
        const missingFeatures = featuresArray.filter(feature => !mergedFeatures[feature]);
        return res.status(403).json({
          success: false,
          message: `Access denied. Required feature(s) not enabled: ${missingFeatures.join(', ')}`,
          requiredFeatures: featuresArray,
          missingFeatures: missingFeatures,
          availableFeatures: Object.keys(mergedFeatures).filter(key => mergedFeatures[key])
        });
      }

      // Add company features to request for use in route handlers
      req.companyFeatures = mergedFeatures;
      req.company = company;

      next();
    } catch (error) {
      console.error('❌ Feature access middleware error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check feature access',
        error: error.message
      });
    }
  };
};

/**
 * Middleware to check if company has any of the specified features
 * @param {string|string[]} features - Feature(s) to check
 * @returns {Function} Express middleware function
 */
const requireAnyFeature = (features) => {
  return requireFeature(features, false);
};

/**
 * Middleware to check if company has all of the specified features
 * @param {string|string[]} features - Feature(s) to check
 * @returns {Function} Express middleware function
 */
const requireAllFeatures = (features) => {
  return requireFeature(features, true);
};

/**
 * Middleware to check if company has a specific feature
 * @param {string} feature - Feature to check
 * @returns {Function} Express middleware function
 */
const requireFeatureAccess = (feature) => {
  return requireFeature(feature, true);
};

module.exports = {
  requireFeature,
  requireAnyFeature,
  requireAllFeatures,
  requireFeatureAccess
};

