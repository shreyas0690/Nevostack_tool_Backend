// Test script to verify plan creation API works
require('dotenv').config();
const mongoose = require('mongoose');
const Plan = require('./models/Plan');

async function testPlanCreation() {
  try {
    console.log('🧪 Testing plan creation...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/nevo-stack');
    console.log('✅ Connected to MongoDB');

    // Create a test plan
    const testPlan = new Plan({
      name: 'testplan',
      displayName: 'Test Plan',
      description: 'A test plan for verification',
      price: 49.99,
      billingCycle: 'monthly',
      features: ['Feature 1', 'Feature 2'],
      limits: {
        maxUsers: 5,
        maxDepartments: 2,
        storageGB: 5
      },
      isPopular: false,
      sortOrder: 0
    });

    await testPlan.save();
    console.log('✅ Test plan created successfully:', testPlan._id);

    // Test the static methods
    const activePlans = await Plan.getActivePlans();
    console.log('✅ Found active plans:', activePlans.length);

    const planByName = await Plan.getPlanByName('testplan');
    console.log('✅ Found plan by name:', planByName?.name);

    // Clean up
    await Plan.findByIdAndDelete(testPlan._id);
    console.log('✅ Test plan cleaned up');

    await mongoose.connection.close();
    console.log('✅ Test completed successfully');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testPlanCreation();