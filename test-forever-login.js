const http = require('http');

console.log('🔍 Testing Login Credentials for Forever Workspace\n');
console.log('🏢 Workspace: forever.nevostack.com\n');

// Common passwords to try
const commonPasswords = [
  'password123',
  'admin123',
  '123456',
  'password',
  'admin',
  'forever123',
  'nevostack123',
  'Jahid@123', // The one user mentioned
  'forever@123',
  'Admin@123'
];

// Possible admin credentials to test
const testCredentials = [
  { email: 'admin@forever.com', username: 'admin', password: 'password123' },
  { email: 'admin@forever.com', username: 'admin', password: 'admin123' },
  { email: 'admin@forever.com', username: 'admin', password: 'Jahid@123' },
  { email: 'admin@forever.com', username: 'admin', password: 'Admin@123' },
  { email: 'admin@forever.com', username: 'administrator', password: 'password123' },
  { email: 'admin@forever.com', username: 'administrator', password: 'admin123' },
  { email: 'admin@forever.com', username: 'administrator', password: 'Jahid@123' },
  { email: 'admin@nevostack.com', username: 'admin', password: 'password123' },
  { email: 'admin@nevostack.com', username: 'admin', password: 'admin123' },
  { email: 'admin@nevostack.com', username: 'admin', password: 'Jahid@123' },
  { email: 'forever@nevostack.com', username: 'forever', password: 'forever123' },
  { email: 'forever@nevostack.com', username: 'forever', password: 'Jahid@123' }
];

// Function to test login
const testLogin = (credentials) => {
  return new Promise((resolve) => {
    const loginData = {
      email: credentials.email,
      password: credentials.password,
      rememberMe: false,
      deviceInfo: {
        deviceName: 'Test Device',
        touchSupport: false,
        webGLSupport: true,
        cookieEnabled: true,
        doNotTrack: '0',
        screenResolution: '1920x1080',
        colorDepth: 24,
        pixelRatio: 1
      }
    };

    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(loginData))
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve({
            credentials,
            status: res.statusCode,
            success: data.success,
            error: data.error,
            message: data.message
          });
        } catch (e) {
          resolve({
            credentials,
            status: res.statusCode,
            success: false,
            error: 'Parse error',
            message: body
          });
        }
      });
    });

    req.on('error', (e) => {
      resolve({
        credentials,
        status: 0,
        success: false,
        error: e.message,
        message: 'Network error'
      });
    });

    req.write(JSON.stringify(loginData));
    req.end();
  });
};

// Test all credentials
async function testAllCredentials() {
  console.log('🔐 Testing different login combinations...\n');

  const results = [];
  let successCount = 0;

  for (let i = 0; i < testCredentials.length; i++) {
    const cred = testCredentials[i];
    console.log(`🔍 Testing ${i + 1}/${testCredentials.length}: ${cred.email} / ${cred.password}`);

    const result = await testLogin(cred);
    results.push(result);

    if (result.success && result.status === 200) {
      successCount++;
      console.log(`   ✅ SUCCESS! Login works!`);
      console.log(`   👤 User: ${result.credentials.email}`);
      console.log(`   🔒 Password: ${result.credentials.password}`);
      console.log('');
      break; // Stop testing once we find working credentials
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n📊 Test Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (successCount > 0) {
    const successfulResult = results.find(r => r.success);
    console.log('🎉 SUCCESS! Working credentials found:');
    console.log(`   🌐 Workspace: forever.nevostack.com`);
    console.log(`   👤 Email: ${successfulResult.credentials.email}`);
    console.log(`   🔒 Password: ${successfulResult.credentials.password}`);
  } else {
    console.log('❌ No working credentials found');
    console.log('');
    console.log('💡 Possible reasons:');
    console.log('   1. Password is different from common ones');
    console.log('   2. Email format is different');
    console.log('   3. User account might be deactivated');
    console.log('');
    console.log('🔧 Solutions:');
    console.log('   1. Ask the person who created the workspace');
    console.log('   2. Create a new admin user for this workspace');
    console.log('   3. Reset password (if you have database access)');
  }

  console.log('');
  console.log('📋 All test results:');
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`   ${index + 1}. ${status} ${result.credentials.email}/${result.credentials.password} → ${result.error}`);
  });
}

testAllCredentials();







