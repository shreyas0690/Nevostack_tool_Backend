// Test to verify user information is properly captured in audit logs
const mongoose = require('mongoose');
const AuditLog = require('./models/AuditLog');

async function testUserInfoInAuditLogs() {
  try {
    console.log('🧪 Testing user info in audit logs...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/nevo-stack');
    console.log('✅ Connected to MongoDB');

    // Find recent audit logs
    const recentLogs = await AuditLog.find()
      .sort({ timestamp: -1 })
      .limit(5)
      .lean();

    console.log('\n📋 Recent Audit Logs:');
    recentLogs.forEach((log, index) => {
      console.log(`${index + 1}. Action: ${log.action}`);
      console.log(`   User ID: ${log.userId || 'null'}`);
      console.log(`   User Email: ${log.userEmail}`);
      console.log(`   User Name: ${log.userName}`);
      console.log(`   User Role: ${log.userRole}`);
      console.log(`   Company: ${log.companyName || 'N/A'}`);
      console.log(`   Timestamp: ${log.timestamp}`);
      console.log('   ---');
    });

    // Check if any logs have proper user info (not "system")
    const userLogs = recentLogs.filter(log => log.userRole !== 'system' && log.userId);
    if (userLogs.length > 0) {
      console.log('✅ Found user audit logs with proper information!');
    } else {
      console.log('⚠️ No user audit logs found - may need to create some actions');
    }

    await mongoose.connection.close();
    console.log('✅ Test completed');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testUserInfoInAuditLogs();



