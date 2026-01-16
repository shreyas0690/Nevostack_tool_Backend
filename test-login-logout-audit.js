// Test script to verify login/logout audit logging
const mongoose = require('mongoose');
const AuditLog = require('./models/AuditLog');

async function testLoginLogoutAudit() {
  try {
    console.log('🧪 Testing login/logout audit logging...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/nevo-stack');
    console.log('✅ Connected to MongoDB');

    // Find recent login/logout audit logs
    const recentLogs = await AuditLog.find({
      action: { $in: ['login_success', 'login_failed', 'user_logout'] }
    })
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();

    console.log('\n🔐 Recent Login/Logout Audit Logs:');
    if (recentLogs.length === 0) {
      console.log('❌ No login/logout audit logs found');
      console.log('💡 Try logging in/out to generate audit logs');
    } else {
      recentLogs.forEach((log, index) => {
        console.log(`${index + 1}. Action: ${log.action}`);
        console.log(`   User: ${log.userName} (${log.userEmail})`);
        console.log(`   Role: ${log.userRole}`);
        console.log(`   Company: ${log.companyName || 'N/A'}`);
        console.log(`   IP: ${log.ipAddress}`);
        console.log(`   Device: ${log.device}`);
        console.log(`   Timestamp: ${log.timestamp}`);
        if (log.metadata) {
          console.log(`   Metadata:`, JSON.stringify(log.metadata, null, 2));
        }
        console.log('   ---');
      });

      // Count by action type
      const loginSuccess = recentLogs.filter(log => log.action === 'login_success').length;
      const loginFailed = recentLogs.filter(log => log.action === 'login_failed').length;
      const logout = recentLogs.filter(log => log.action === 'user_logout').length;

      console.log(`\n📊 Summary:`);
      console.log(`   ✅ Login Success: ${loginSuccess}`);
      console.log(`   ❌ Login Failed: ${loginFailed}`);
      console.log(`   🚪 Logout: ${logout}`);
    }

    await mongoose.connection.close();
    console.log('✅ Test completed');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testLoginLogoutAudit();


