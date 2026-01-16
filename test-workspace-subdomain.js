const http = require('http');

console.log('🔍 Testing workspace subdomain lookup...\n');

// Test with different subdomains
const subdomains = ['fresh', 'test', 'demo'];

subdomains.forEach(subdomain => {
  console.log(`\n🌐 Testing subdomain: ${subdomain}`);

  const options = {
    hostname: 'localhost',
    port: 5000,
    path: `/api/workspaces/subdomain/${subdomain}`,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const req = http.request(options, (res) => {
    console.log(`   📊 Status: ${res.statusCode}`);

    let body = '';
    res.on('data', (chunk) => {
      body += chunk;
    });

    res.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.success && data.workspace) {
          console.log(`   ✅ Found workspace: ${data.workspace.name}`);
          console.log(`   📋 Status: ${data.workspace.status}`);
          console.log(`   📅 Trial Ends: ${data.workspace.trialEndsAt}`);
          console.log(`   🏢 Plan: ${data.workspace.plan}`);

          // Check if trial is still valid
          const now = new Date();
          const trialEnd = new Date(data.workspace.trialEndsAt);
          const isValid = trialEnd > now;
          console.log(`   ⏰ Trial Valid: ${isValid} (${Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24))} days)`);
        } else {
          console.log(`   ❌ Error: ${data.message || data.error}`);
        }
      } catch (e) {
        console.log(`   ❌ Parse Error: ${body}`);
      }
    });
  });

  req.on('error', (e) => {
    console.error(`   ❌ Request Error: ${e.message}`);
  });

  req.end();
});







