const http = require('http');

console.log('🔍 Testing login validation with deviceInfo...\n');

// Test login with deviceInfo (like frontend sends)
const loginData = {
  email: 'test@example.com',
  password: 'password123',
  rememberMe: false,
  deviceInfo: {
    deviceName: 'Win32 - Chrome',
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
  console.log(`📊 Status: ${res.statusCode} ${res.statusMessage}`);
  console.log(`📋 Response Headers:`, Object.fromEntries(res.headers.entries()));

  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      console.log('\n📦 Response Body:');
      console.log(JSON.stringify(data, null, 2));

      if (data.success) {
        console.log('\n✅ Login validation PASSED!');
      } else {
        console.log('\n❌ Login validation FAILED:');
        console.log('Error:', data.error);
        console.log('Message:', data.message);
      }
    } catch (e) {
      console.log('\n❌ Parse Error:', body);
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ Request Error: ${e.message}`);
});

req.write(JSON.stringify(loginData));
req.end();







