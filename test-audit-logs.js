require('dotenv').config();
const mongoose = require('mongoose');
const AuditService = require('./services/auditService');

async function testAuditLogs() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/nevo-stack');
    console.log('✅ Connected to MongoDB');

    // Test creating an audit log
    console.log('📝 Testing audit log creation...');
    const auditLog = await AuditService.createAuditLogWithUser(null, 'test_action', 'Test audit log creation', {
      category: 'system',
      severity: 'low',
      metadata: { test: true }
    });

    if (auditLog) {
      console.log('✅ Audit log created successfully:', auditLog._id);
    } else {
      console.log('❌ Failed to create audit log');
    }

    // Test fetching audit logs
    console.log('📊 Testing audit log fetching...');
    const result = await AuditService.getAuditLogs({}, { page: 1, limit: 10 });
    console.log(`📊 Found ${result.logs.length} audit logs`);

    // Close connection
    await mongoose.connection.close();
    console.log('✅ Test completed');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testAuditLogs();



