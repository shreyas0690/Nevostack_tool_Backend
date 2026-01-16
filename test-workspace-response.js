const http = require('http');

console.log('🔍 Testing workspace API response structure...\n');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/workspaces/subdomain/rest',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  console.log(`📊 Status: ${res.statusCode} ${res.statusMessage}`);

  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      console.log('\n📦 Response Structure:');
      console.log('✅ success:', data.success);

      if (data.workspace) {
        console.log('\n🏢 Workspace Fields:');
        const workspace = data.workspace;

        console.log('✅ name:', workspace.name);
        console.log('✅ subdomain:', workspace.subdomain);
        console.log('✅ status:', workspace.status);
        console.log('✅ plan:', workspace.plan);
        console.log('✅ trialEndsAt:', workspace.trialEndsAt);

        console.log('\n🔍 Billing Object:');
        console.log('✅ billing exists:', !!workspace.billing);
        if (workspace.billing) {
          console.log('✅ billing.interval:', workspace.billing.interval);
          console.log('✅ billing.amount:', workspace.billing.amount);
          console.log('✅ billing.currency:', workspace.billing.currency);
        }

        console.log('\n🔍 Limits Object:');
        console.log('✅ limits exists:', !!workspace.limits);
        if (workspace.limits) {
          console.log('✅ limits.maxUsers:', workspace.limits.maxUsers);
        }

        console.log('\n🔍 Usage Object:');
        console.log('✅ usage exists:', !!workspace.usage);
        if (workspace.usage) {
          console.log('✅ usage.currentUsers:', workspace.usage.currentUsers);
        }
      } else {
        console.log('❌ No workspace data found');
      }
    } catch (e) {
      console.log('\n❌ Parse Error:', body);
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ Request Error: ${e.message}`);
});

req.end();







