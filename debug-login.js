const http = require('http');

// Test the exact login request that frontend sends
const loginData = {
  email: 'test@example.com',
  password: 'test123',
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

console.log('🔍 Testing login with deviceInfo...\n');
console.log('📤 Sending:', JSON.stringify(loginData, null, 2));

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
  console.log(`\n📊 Status: ${res.statusCode} ${res.statusMessage}`);

  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    console.log('\n📦 Response Body:');
    try {
      const data = JSON.parse(body);
      console.log(JSON.stringify(data, null, 2));
    } catch (e) {
      console.log('Raw:', body);
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ Request Error: ${e.message}`);
});

req.write(JSON.stringify(loginData));
req.end();







