const http = require('http');

// Simulate the exact frontend API call
const simulateFrontendCall = () => {
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

    console.log('🔍 Simulating Frontend API Call\n');
    console.log('📤 Request Data:');
    console.log(`   Email: ${loginData.email}`);
    console.log(`   Password: ${loginData.password}`);
    console.log(`   Has Device Info: ${!!loginData.deviceInfo}`);
    console.log(`   Device Info Keys: ${Object.keys(loginData.deviceInfo).join(', ')}\n`);

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

    console.log('🌐 Request Details:');
    console.log(`   URL: http://${options.hostname}:${options.port}${options.path}`);
    console.log(`   Method: ${options.method}`);
    console.log(`   Headers: ${JSON.stringify(options.headers, null, 2)}\n`);

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        console.log('📊 Response Details:');
        console.log(`   Status: ${res.statusCode} ${res.statusMessage}`);
        console.log(`   Headers: ${JSON.stringify(Object.fromEntries(Object.entries(res.headers).slice(0, 5)), null, 2)}`);

        try {
          const data = JSON.parse(body);
          console.log('\n📦 Response Body:');
          console.log(JSON.stringify(data, null, 2));

          if (res.statusCode === 200) {
            console.log('\n✅ SUCCESS: Login API working correctly!');
            if (data.user) {
              console.log(`👤 User: ${data.user.email} (${data.user.role})`);
            }
            if (data.tokens) {
              console.log(`🔑 Tokens: ${!!data.tokens.accessToken && !!data.tokens.refreshToken ? 'Generated' : 'Missing'}`);
            }
          } else {
            console.log('\n❌ ERROR: API returned error status');

            // Analyze common error causes
            if (res.statusCode === 401) {
              console.log('🚨 401 Unauthorized - Possible causes:');
              console.log('   1. Wrong email/password combination');
              console.log('   2. User account locked/disabled');
              console.log('   3. Password field not retrieved from database');
              console.log('   4. Bcrypt comparison failed');
            } else if (res.statusCode === 400) {
              console.log('🚨 400 Bad Request - Possible causes:');
              console.log('   1. Missing required fields');
              console.log('   2. Invalid email format');
              console.log('   3. Password too short');
              console.log('   4. Validation failed');
            } else if (res.statusCode === 500) {
              console.log('🚨 500 Internal Server Error - Possible causes:');
              console.log('   1. Database connection issue');
              console.log('   2. Server error during password comparison');
              console.log('   3. User model error');
            }
          }
          resolve(data);
        } catch (e) {
          console.log('\n❌ Error parsing response:');
          console.log(`   Raw body: ${body}`);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error('\n❌ Request failed:', e.message);
      console.log('🚨 Possible causes:');
      console.log('   1. Server not running');
      console.log('   2. Wrong port (should be 5000)');
      console.log('   3. CORS issue');
      console.log('   4. Network connectivity problem');
      resolve(null);
    });

    console.log('🚀 Sending request...');
    req.write(JSON.stringify(loginData));
    req.end();
  });
};

// Run the test
const runTest = async () => {
  try {
    await simulateFrontendCall();
  } catch (error) {
    console.error('\n💥 Test execution error:', error);
  }
};

runTest();






