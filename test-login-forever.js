const http = require('http');

console.log('🔍 Testing Login for Workspace "forever.nevostack.com"\n');
console.log('👤 User: jahid');
console.log('🔒 Password: Jahid@123\n');

// Step 1: Check if workspace exists
console.log('🏢 Step 1: Checking if workspace "forever" exists...');

const checkWorkspace = () => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/workspaces/subdomain/forever',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (res.statusCode === 200 && data.success) {
            console.log('✅ Workspace "forever" FOUND:');
            console.log(`   📋 Name: ${data.workspace.name}`);
            console.log(`   🌐 Domain: ${data.workspace.domain}`);
            console.log(`   📊 Status: ${data.workspace.status}`);
            console.log(`   🏷️ Plan: ${data.workspace.plan}`);
            console.log(`   📅 Trial Ends: ${data.workspace.trialEndsAt}`);
            resolve(data.workspace);
          } else {
            console.log('❌ Workspace "forever" NOT FOUND');
            console.log(`   Response: ${body}`);
            resolve(null);
          }
        } catch (e) {
          console.log('❌ Error parsing workspace response:', body);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error('❌ Workspace check error:', e.message);
      resolve(null);
    });

    req.end();
  });
};

// Step 2: Test login
const testLogin = () => {
  return new Promise((resolve, reject) => {
    console.log('\n🔐 Step 2: Testing login with credentials...');

    const loginData = {
      email: 'jahid', // Trying as email/username
      password: 'Jahid@123',
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

// Step 3: Try login with different email formats
const testDifferentEmailFormats = () => {
  return new Promise((resolve, reject) => {
    console.log('\n🔄 Step 3: Testing different email formats...');

    const emailFormats = [
      'jahid@forever.com',
      'jahid@nevostack.com',
      'jahid@gmail.com',
      'jahid'
    ];

    let completed = 0;
    const results = [];

    emailFormats.forEach((email) => {
      const loginData = {
        email: email,
        password: 'Jahid@123',
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
          completed++;
          try {
            const data = JSON.parse(body);
            results.push({
              email: email,
              status: res.statusCode,
              success: data.success,
              error: data.error
            });
          } catch (e) {
            results.push({
              email: email,
              status: res.statusCode,
              success: false,
              error: 'Parse error'
            });
          }

          if (completed === emailFormats.length) {
            console.log('\n📊 Email Format Test Results:');
            results.forEach(result => {
              console.log(`   ${result.email}: ${result.status === 200 ? '✅' : '❌'} ${result.error || 'Success'}`);
            });
            resolve(results);
          }
        });
      });

      req.on('error', (e) => {
        completed++;
        results.push({
          email: email,
          status: 0,
          success: false,
          error: e.message
        });

        if (completed === emailFormats.length) {
          resolve(results);
        }
      });

      req.write(JSON.stringify(loginData));
      req.end();
    });
  });
};

// Run all tests
async function runTests() {
  try {
    // Step 1: Check workspace
    const workspace = await checkWorkspace();

    if (workspace) {
      // Step 2: Test login
      await testLogin();

      // Step 3: Test different email formats
      await testDifferentEmailFormats();
    } else {
      console.log('\n❌ Cannot proceed with login test - workspace not found');
      console.log('💡 Create the workspace first or check the subdomain name');
    }

    console.log('\n🎯 Test Summary:');
    console.log('📋 Workspace: forever.nevostack.com');
    console.log('👤 User: jahid');
    console.log('🔒 Password: Jahid@123');
    console.log('\n💡 If login fails, the user might not exist in the database');
    console.log('💡 Try registering a new company/workspace first');

  } catch (error) {
    console.error('\n💥 Test execution error:', error);
  }
}

runTests();







