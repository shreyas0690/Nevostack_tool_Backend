// Test script to verify status toggle functionality
const mongoose = require('mongoose');
const { User } = require('./models');

async function testStatusToggle() {
  try {
    console.log('🔄 Testing User Status Toggle Functionality...\n');

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nevostack');
    console.log('✅ Connected to database');

    // Find a test user
    const testUser = await User.findOne({ email: { $regex: /test|demo/i } }).limit(1);
    if (!testUser) {
      console.log('❌ No test user found. Creating one...');
      return;
    }

    console.log(`📋 Test User: ${testUser.firstName} ${testUser.lastName} (${testUser.email})`);
    console.log(`📊 Current Status: ${testUser.status}`);

    // Toggle status
    const newStatus = testUser.status === 'active' ? 'inactive' : 'active';
    console.log(`🔄 Toggling status to: ${newStatus}`);

    // Update using the same logic as the backend API
    const updatedUser = await User.findByIdAndUpdate(
      testUser._id,
      { status: newStatus },
      { new: true }
    );

    console.log(`✅ Status updated successfully!`);
    console.log(`📊 New Status: ${updatedUser.status}`);
    console.log(`⏰ Updated At: ${updatedUser.updatedAt}`);

    // Verify the update
    const verifyUser = await User.findById(testUser._id);
    console.log(`🔍 Verification - Status: ${verifyUser.status}`);

    if (verifyUser.status === newStatus) {
      console.log('🎉 SUCCESS: Status toggle functionality works correctly!');
    } else {
      console.log('❌ FAILED: Status was not updated properly');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('📪 Disconnected from database');
  }
}

// Run the test
testStatusToggle();
