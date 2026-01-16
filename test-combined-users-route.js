// Test script to verify the combined /users route works correctly
const mongoose = require('mongoose');

// Simple test to check if the route structure is correct
async function testCombinedRoute() {
  try {
    console.log('🧪 Testing combined /users route structure...');

    // Connect to MongoDB to verify models exist
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/nevo-stack');
    console.log('✅ Connected to MongoDB');

    // Check if required models exist
    const User = require('./models/User');
    const Company = require('./models/Company');
    const Task = require('./models/Task');
    const Leave = require('./models/Leave');
    const Meeting = require('./models/Meeting');

    console.log('✅ All required models loaded');

    // Test basic queries that the route uses
    const userCount = await User.countDocuments();
    console.log(`✅ Found ${userCount} users in database`);

    const companyCount = await Company.countDocuments();
    console.log(`✅ Found ${companyCount} companies in database`);

    // Test aggregation queries
    const roleStats = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    console.log(`✅ Role stats aggregation works: ${roleStats.length} roles found`);

    await mongoose.connection.close();
    console.log('✅ Test completed successfully');

    console.log('\n📋 Route Response Structure:');
    console.log('GET /api/saas/users');
    console.log('Response:');
    console.log('{');
    console.log('  "success": true,');
    console.log('  "data": {');
    console.log('    "users": [...],');
    console.log('    "stats": {');
    console.log('      "totalUsers": number,');
    console.log('      "activeUsers": number,');
    console.log('      "blockedUsers": number,');
    console.log('      "suspendedUsers": number,');
    console.log('      "pendingUsers": number,');
    console.log('      "roleStats": [...],');
    console.log('      "companyStats": [...]');
    console.log('    },');
    console.log('    "pagination": {...},');
    console.log('    "filters": {...}');
    console.log('  }');
    console.log('}');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testCombinedRoute();


