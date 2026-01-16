// Simple test to verify audit logging is working
const mongoose = require('mongoose');
const AuditLog = require('./models/AuditLog');

async function testAuditLogs() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/nevo-stack');
    console.log('✅ Connected to MongoDB');

    // Check if AuditLog collection exists and has any documents
    const count = await AuditLog.countDocuments();
    console.log(`📊 Total audit logs in database: ${count}`);

    if (count > 0) {
      // Get the latest audit logs
      const latestLogs = await AuditLog.find()
        .sort({ timestamp: -1 })
        .limit(5)
        .lean();

      console.log('\n🔍 Latest Audit Logs:');
      latestLogs.forEach((log, index) => {
        console.log(`${index + 1}. ${log.action} by ${log.userName} (${log.userEmail}) - ${log.status} - ${log.timestamp}`);
      });
    } else {
      console.log('⚠️ No audit logs found in database');
      console.log('💡 Try creating a task, meeting, or leave to generate audit logs');
    }

    await mongoose.connection.close();
    console.log('✅ Test completed');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testAuditLogs();



