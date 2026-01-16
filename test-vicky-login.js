const http = require('http');

console.log('🔍 Testing Login for Vicky User\n');
console.log('👤 Email: vicky@gmail.com');
console.log('🔒 Password: Vicky@123\n');

// Test login
const testLogin = () => {
  return new Promise((resolve) => {
    console.log('🔐 Testing login with credentials...');

    const loginData = {
      email: 'vicky@gmail.com',
      password: 'Vicky@123',
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

            // Show workspace info if available
            if (data.user?.companyId) {
              console.log('\n🏢 Checking user workspace...');
              // Get workspace info
              const workspaceOptions = {
                hostname: 'localhost',
                port: 5000,
                path: '/api/workspaces/subdomain/forever',
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${data.tokens?.accessToken}`
                }
              };

              const workspaceReq = http.request(workspaceOptions, (workspaceRes) => {
                let workspaceBody = '';
                workspaceRes.on('data', (chunk) => workspaceBody += chunk);
                workspaceRes.on('end', () => {
                  try {
                    const workspaceData = JSON.parse(workspaceBody);
                    if (workspaceData.success) {
                      console.log(`🌐 Workspace: ${workspaceData.workspace?.domain || 'N/A'}`);
                      console.log(`📋 Name: ${workspaceData.workspace?.name || 'N/A'}`);
                      console.log(`📊 Status: ${workspaceData.workspace?.status || 'N/A'}`);
                    }
                  } catch (e) {
                    console.log('   (Could not fetch workspace details)');
                  }
                  resolve(data);
                });
              });

              workspaceReq.on('error', () => {
                console.log('   (Could not fetch workspace details)');
                resolve(data);
              });

              workspaceReq.end();
            } else {
              resolve(data);
            }
          } else {
            console.log('\n❌ LOGIN FAILED!');
            console.log(`Error: ${data.error}`);
            console.log(`Message: ${data.message}`);
            resolve(data);
          }
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
    const result = await testLogin();

    console.log('\n🎯 Test Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (result && result.success) {
      console.log('🎉 SUCCESS! Vicky can login successfully!');
      console.log('');
      console.log('🔑 Working Credentials:');
      console.log(`   👤 Email: vicky@gmail.com`);
      console.log(`   🔒 Password: Vicky@123`);
      console.log(`   🏷️  Role: ${result.user?.role || 'user'}`);
      console.log(`   📊 Status: ${result.user?.status || 'active'}`);
    } else {
      console.log('❌ FAILED! Vicky login failed');
      console.log('');
      console.log('💡 Possible reasons:');
      console.log('   1. User does not exist in database');
      console.log('   2. Password is incorrect');
      console.log('   3. Email format is wrong');
      console.log('   4. Account is deactivated');
      console.log('');
      console.log('🔧 Solutions:');
      console.log('   1. Create new user with these credentials');
      console.log('   2. Check database for existing user');
      console.log('   3. Reset password if user exists');
    }

  } catch (error) {
    console.error('\n💥 Test execution error:', error);
  }
}

runTest();







