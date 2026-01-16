// Test script to verify audit logging is working
require('dotenv').config();
const mongoose = require('mongoose');
const AuditService = require('./services/auditService');

async function testAuditFix() {
  try {
    console.log('🧪 Testing audit log fix...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/nevo-stack');
    console.log('✅ Connected to MongoDB');

    // Test creating audit log with system user (no userId)
    console.log('📝 Testing system audit log creation...');
    const systemLog = await AuditService.createAuditLogWithUser(null, 'system_backup', 'System backup completed', {
      userRole: 'system',
      userName: 'System',
      userEmail: 'system@nevo.com',
      category: 'system',
      severity: 'low'
    });

    if (systemLog) {
      console.log('✅ System audit log created successfully:', systemLog._id);
    } else {
      console.log('❌ Failed to create system audit log');
    }

    // Test creating audit log with real user
    console.log('👤 Testing user audit log creation...');
    const userLog = await AuditService.createAuditLogWithUser('60f1b2b3c4d5e6f7g8h9i0j1', 'task_created', 'User created a new task', {
      category: 'user',
      severity: 'low'
    });

    if (userLog) {
      console.log('✅ User audit log created successfully:', userLog._id);
    } else {
      console.log('❌ Failed to create user audit log');
    }

    // Fetch recent logs
    const result = await AuditService.getAuditLogs({}, { page: 1, limit: 5 });
    console.log(`📊 Found ${result.logs.length} audit logs in database`);

    await mongoose.connection.close();
    console.log('✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testAuditFix();



