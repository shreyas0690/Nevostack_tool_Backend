const http = require('http');

console.log('🔍 Testing Login for agamon@gmail.com\n');
console.log('👤 Email: agamon@gmail.com');
console.log('🔒 Password: Agamon@123\n');

// Test login
const testLogin = () => {
  return new Promise((resolve) => {
    console.log('🔐 Testing login with credentials...');

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

    console.log('📤 Sending login request:');
    console.log(`   Email: ${loginData.email}`);
    console.log(`   Password: ${loginData.password}`);
    console.log(`   Has Device Info: ${!!loginData.deviceInfo}`);

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
        console.log(`\n📊 Login Response Status: ${res.statusCode} ${res.statusMessage}`);

        try {
          const data = JSON.parse(body);
          console.log('📦 Response Body:');
          console.log(JSON.stringify(data, null, 2));

          if (res.statusCode === 200 && data.success) {
            console.log('\n🎉 LOGIN SUCCESS!');
            console.log('✅ User authenticated successfully');
            console.log(`👤 User: ${data.user?.email || data.user?.username}`);
            console.log(`🏢 Company: ${data.user?.companyId}`);
            console.log(`🔑 Tokens: ${!!data.tokens?.accessToken && !!data.tokens?.refreshToken ? 'Generated' : 'Missing'}`);
          } else {
            console.log('\n❌ LOGIN FAILED!');
            console.log(`Error: ${data.error}`);
            console.log(`Message: ${data.message}`);
          }
          resolve(data);
        } catch (e) {
          console.log('\n❌ Error parsing login response:', body);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error('\n❌ Login request error:', e.message);
      resolve(null);
    });

    req.write(JSON.stringify(loginData));
    req.end();
  });
};

// Run test
async function runTest() {
  try {
    console.log('🎯 Testing agamon@gmail.com login...\n');
    const result = await testLogin();

    console.log('\n🎯 Test Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (result && result.success) {
      console.log('🎉 SUCCESS! agamon@gmail.com can login successfully!');
      console.log('');
      console.log('🔑 Working Credentials:');
      console.log(`   👤 Email: agamon@gmail.com`);
      console.log(`   🔒 Password: Agamon@123`);
      console.log(`   🏷️  Role: ${result.user?.role || 'user'}`);
      console.log(`   📊 Status: ${result.user?.status || 'active'}`);
    } else {
      console.log('❌ FAILED! agamon@gmail.com login failed');
      console.log('');
      console.log('💡 Check the backend console logs for detailed debugging information');
      console.log('💡 The logs will show:');
      console.log('   - If user exists in database');
      console.log('   - If password field is being retrieved');
      console.log('   - Password comparison results');
    }

  } catch (error) {
    console.error('\n💥 Test execution error:', error);
  }
}

runTest();







