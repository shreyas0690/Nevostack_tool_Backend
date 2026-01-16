const http = require('http');

console.log('🔍 Testing subdomain "rest" lookup...\n');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/workspaces/subdomain/rest',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache'
  }
};

const req = http.request(options, (res) => {
  console.log(`📊 Status: ${res.statusCode} ${res.statusMessage}`);
  console.log(`📋 Headers:`, JSON.stringify(res.headers, null, 2));

  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    try {
      if (body.trim()) {
        const data = JSON.parse(body);
        console.log('\n📦 Response Body:');
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log('\n📦 Empty Response Body');
      }
    } catch (e) {
      console.log('\n📦 Raw Response:', body);
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ Request Error: ${e.message}`);
});

req.end();







