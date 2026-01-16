const http = require('http');

const postData = JSON.stringify({
  companyName: 'Fixed Test Company',
  companyEmail: 'fixed@example.com',
  companyPhone: '1234567890',
  domain: 'fixed.nevostack.com',
  adminName: 'John',  // Single name to test lastName fallback
  adminEmail: 'fixedadmin@example.com',
  adminUsername: 'fixedadmin',
  adminPassword: 'Password123!'
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/register-company',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('🚀 Testing FIXED company registration...');
console.log('📋 Sending data:', JSON.parse(postData));

const req = http.request(options, (res) => {
  console.log(`\n📊 Status: ${res.statusCode}`);

  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      console.log('\n✅ Response:', JSON.stringify(data, null, 2));

      if (data.success) {
        console.log('\n🎉 SUCCESS! All entities created:');
        console.log('🏢 Company ID:', data.company?.id);
        console.log('👤 Admin User ID:', data.admin?.id);
        console.log('👤 Admin User Name:', data.admin?.firstName, data.admin?.lastName);
        console.log('🏢 Workspace ID:', data.workspace?.id);

        if (!data.workspace?.id) {
          console.log('\n⚠️  WARNING: Workspace creation failed');
        } else {
          console.log('\n✅ All three entities created successfully!');
        }
      } else {
        console.log('\n❌ FAILED:', data.message);
      }
    } catch (e) {
      console.log('\n❌ Raw response:', body);
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ Problem with request: ${e.message}`);
});

req.write(postData);
req.end();









