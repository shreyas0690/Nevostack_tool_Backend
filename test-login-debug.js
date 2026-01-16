const http = require('http');

console.log('🔍 Testing Login with Debug Logging...\n');

const testLogin = () => {
  return new Promise((resolve) => {
    const loginData = {
      email: 'agamon@gmail.com',
      password: 'Agamon@123',
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

    console.log('📤 Sending login request...');
    console.log(`   Email: ${loginData.email}`);
    console.log(`   Password: ${loginData.password}`);

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
            console.log('\n🎉 LOGIN SUCCESS!');
          } else {
            console.log('\n❌ LOGIN FAILED!');
            console.log('💡 Check the backend server console logs for detailed debugging information');
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
async function runTest() {
  try {
    await testLogin();
  } catch (error) {
    console.error('\n💥 Test execution error:', error);
  }
}

runTest();






