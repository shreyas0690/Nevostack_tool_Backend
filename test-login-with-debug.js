const http = require('http');

// Test login with debug logging enabled
const testLoginWithDebug = () => {
  return new Promise((resolve) => {
    const loginData = {
      email: 'agamon@gmail.com',
      password: 'Agamon@123',
      rememberMe: false,
      deviceInfo: {
        deviceName: 'Test Device - Windows - Chrome',
        touchSupport: false,
        webGLSupport: true,
        cookieEnabled: true,
        doNotTrack: '0',
        screenResolution: '1920x1080',
        colorDepth: 24,
        pixelRatio: 1
      }
    };

    console.log('🔍 Testing Login with Debug Logging\n');
    console.log('📤 Sending request to trigger detailed server logs...');

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
        console.log(`\n📊 Response Status: ${res.statusCode} ${res.statusMessage}`);

        try {
          const data = JSON.parse(body);
          console.log('📦 Response Body:');
          console.log(JSON.stringify(data, null, 2));

          if (res.statusCode === 200) {
            console.log('\n✅ SUCCESS: Login worked!');
          } else {
            console.log('\n❌ Check the backend server console for detailed error logs');
            console.log('🔍 The server logs will show:');
            console.log('   - Login attempt details');
            console.log('   - Password verification process');
            console.log('   - Exact error that caused the 500 status');
          }
          resolve(data);
        } catch (e) {
          console.log('\n❌ Error parsing response:', body);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error('\n❌ Request error:', e.message);
      resolve(null);
    });

    req.write(JSON.stringify(loginData));
    req.end();
  });
};

// Run test
const runTest = async () => {
  try {
    console.log('🚀 Starting login test...\n');
    await testLoginWithDebug();
    console.log('\n💡 Check the backend server console (where you ran "node server.js")');
    console.log('   for detailed error information that will help identify the issue.');
  } catch (error) {
    console.error('\n💥 Test execution error:', error);
  }
};

runTest();






