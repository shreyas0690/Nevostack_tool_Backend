const fetch = require('node-fetch');

async function testAuditLogs() {
  try {
    console.log('🧪 Testing audit logs with API calls...');

    // First, try to login as a test user (this will create an audit log if auth routes have audit middleware)
    const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'admin@demo.com',
        password: 'admin123'
      })
    });

    const loginData = await loginResponse.json();
    console.log('Login response:', loginData);

    if (loginData.token) {
      console.log('✅ Login successful, token received');

      // Now try to fetch audit logs
      const auditResponse = await fetch('http://localhost:5000/api/saas/audit-logs?page=1&limit=10', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${loginData.token}`,
          'Content-Type': 'application/json',
        }
      });

      if (auditResponse.ok) {
        const auditData = await auditResponse.json();
        console.log(`📊 Found ${auditData.data.length} audit logs`);
        if (auditData.data.length > 0) {
          console.log('✅ Audit logs are being created!');
          console.log('Sample log:', auditData.data[0]);
        } else {
          console.log('⚠️ No audit logs found - they may not be created yet');
        }
      } else {
        console.log('❌ Failed to fetch audit logs:', auditResponse.status);
      }
    } else {
      console.log('❌ Login failed - cannot test audit logs');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testAuditLogs();



