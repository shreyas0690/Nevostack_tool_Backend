const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireFeatureAccess, requireAnyFeature, requireAllFeatures } = require('../middleware/featureAccess');

// Example 1: Single feature requirement
router.get('/tasks', authenticateToken, requireFeatureAccess('taskManagement'), async (req, res) => {
  try {
    // This route is only accessible if company has taskManagement feature
    res.json({
      success: true,
      message: 'Tasks endpoint accessed successfully',
      features: req.companyFeatures
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Example 2: Any of multiple features
router.get('/meetings', authenticateToken, requireAnyFeature(['meetings', 'meetingScheduler']), async (req, res) => {
  try {
    // This route is accessible if company has either 'meetings' OR 'meetingScheduler' feature
    res.json({
      success: true,
      message: 'Meetings endpoint accessed successfully',
      features: req.companyFeatures
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Example 3: All features required
router.get('/advanced-analytics', authenticateToken, requireAllFeatures(['analytics', 'reports']), async (req, res) => {
  try {
    // This route requires BOTH 'analytics' AND 'reports' features
    res.json({
      success: true,
      message: 'Advanced analytics endpoint accessed successfully',
      features: req.companyFeatures
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Example 4: Leave management with feature check
router.get('/leave-requests', authenticateToken, requireFeatureAccess('leaveManagement'), async (req, res) => {
  try {
    // Only accessible if company has leaveManagement feature
    res.json({
      success: true,
      message: 'Leave requests endpoint accessed successfully',
      features: req.companyFeatures
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Example 5: Attendance with feature check
router.get('/attendance', authenticateToken, requireFeatureAccess('attendance'), async (req, res) => {
  try {
    // Only accessible if company has attendance feature
    res.json({
      success: true,
      message: 'Attendance endpoint accessed successfully',
      features: req.companyFeatures
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Example 6: Reports with feature check
router.get('/reports', authenticateToken, requireFeatureAccess('reports'), async (req, res) => {
  try {
    // Only accessible if company has reports feature
    res.json({
      success: true,
      message: 'Reports endpoint accessed successfully',
      features: req.companyFeatures
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
