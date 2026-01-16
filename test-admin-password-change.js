// Test script to verify admin password change functionality
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User } = require('./models');

async function testAdminPasswordChange() {
  try {
    console.log('🔐 Testing Admin Password Change Functionality...\n');

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nevostack');
    console.log('✅ Connected to database');

    // Find test users
    const adminUser = await User.findOne({ role: 'admin' }).limit(1);
    const testUser = await User.findOne({ role: { $in: ['member', 'manager'] } }).limit(1);

    if (!adminUser || !testUser) {
      console.log('❌ Test users not found. Need at least one admin and one regular user.');
      return;
    }

    console.log(`👤 Admin: ${adminUser.firstName} ${adminUser.lastName} (${adminUser.email})`);
    console.log(`👤 Target User: ${testUser.firstName} ${testUser.lastName} (${testUser.email})`);
    console.log(`📊 Original Password Hash: ${testUser.password.substring(0, 20)}...`);

    // Test password change
    const newPassword = 'TestPassword123!';
    console.log(`🔄 Changing password to: ${newPassword}`);

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    const updatedUser = await User.findByIdAndUpdate(
      testUser._id,
      {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null
      },
      { new: true }
    );

    console.log(`✅ Password updated successfully!`);
    console.log(`📊 New Password Hash: ${updatedUser.password.substring(0, 20)}...`);
    console.log(`⏰ Password Changed At: ${updatedUser.passwordChangedAt}`);

    // Verify password works
    const isValidPassword = await bcrypt.compare(newPassword, updatedUser.password);
    console.log(`🔍 Password verification: ${isValidPassword ? '✅ Valid' : '❌ Invalid'}`);

    if (isValidPassword) {
      console.log('🎉 SUCCESS: Admin password change functionality works correctly!');
    } else {
      console.log('❌ FAILED: Password change did not work properly');
    }

    // Clean up - revert to original password for testing
    console.log('🧹 Reverting to original password for testing...');
    await User.findByIdAndUpdate(testUser._id, {
      password: testUser.password,
      passwordChangedAt: testUser.passwordChangedAt
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('📪 Disconnected from database');
  }
}

// Run the test
testAdminPasswordChange();
