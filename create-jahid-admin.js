const http = require('http');

console.log('🔍 Creating new workspace with Jahid as admin...\n');

// Registration data for jahid admin
const registrationData = {
  companyName: 'Forever Company',
  companyEmail: 'jahid@forever.com',
  companyPhone: '1234567890',
  domain: 'jahid.nevostack.com', // Different subdomain to avoid conflict
  adminName: 'Jahid Admin',
  adminEmail: 'jahid@forever.com',
  adminUsername: 'jahid',
  adminPassword: 'Jahid@123'
};

console.log('📋 Registration Details:');
console.log(`   🏢 Company: ${registrationData.companyName}`);
console.log(`   📧 Company Email: ${registrationData.companyEmail}`);
console.log(`   🌐 Domain: ${registrationData.domain}`);
console.log(`   👤 Admin: ${registrationData.adminName}`);
console.log(`   👤 Username: ${registrationData.adminUsername}`);
console.log(`   🔒 Password: ${registrationData.adminPassword}`);
console.log('');

const registerCompany = () => {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(registrationData);

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

    console.log('🚀 Sending registration request...');

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);

          if (res.statusCode === 201 && data.success) {
            console.log('✅ Registration successful!');
            console.log(`   🏢 Company ID: ${data.company?.id}`);
            console.log(`   👤 Admin ID: ${data.admin?.id}`);
            console.log(`   🏢 Workspace ID: ${data.workspace?.id}`);
            console.log('');

            resolve(data);
          } else {
            console.log('❌ Registration failed:');
            console.log(`   Error: ${data.error}`);
            console.log(`   Message: ${data.message}`);
            resolve(null);
          }
        } catch (e) {
          console.log('❌ Error parsing response:', body);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error('❌ Request error:', e.message);
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
};

// Test login after registration
const testLogin = () => {
  return new Promise((resolve) => {
    console.log('🔐 Testing login with new credentials...');

    const loginData = {
      email: 'jahid@forever.com',
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
        try {
          const data = JSON.parse(body);
          resolve({
            status: res.statusCode,
            success: data.success,
            error: data.error
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            success: false,
            error: 'Parse error'
          });
        }
      });
    });

    req.on('error', (e) => {
      resolve({
        status: 0,
        success: false,
        error: e.message
      });
    });

    req.write(JSON.stringify(loginData));
    req.end();
  });
};

// Main execution
async function createAndTest() {
  try {
    // Step 1: Register new company with jahid as admin
    const registrationResult = await registerCompany();

    if (registrationResult) {
      // Step 2: Test login
      const loginResult = await testLogin();

      console.log('\n🎯 Final Result:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      if (loginResult.success) {
        console.log('🎉 SUCCESS! Jahid admin created and login works!');
        console.log('');
        console.log('🔑 Login Credentials:');
        console.log(`   🌐 Workspace: jahid.nevostack.com`);
        console.log(`   👤 Username: jahid`);
        console.log(`   📧 Email: jahid@forever.com`);
        console.log(`   🔒 Password: Jahid@123`);
        console.log(`   🏷️  Role: admin`);
      } else {
        console.log('❌ Login test failed, but registration succeeded');
        console.log(`   Error: ${loginResult.error}`);
        console.log('');
        console.log('💡 Try logging in manually with the credentials above');
      }

      console.log('\n📋 What was created:');
      console.log('   ✅ New company: Forever Company');
      console.log('   ✅ New workspace: jahid.nevostack.com');
      console.log('   ✅ Admin user: jahid with password Jahid@123');
      console.log('   ✅ 14-day free trial activated');

    } else {
      console.log('\n❌ Registration failed - check error messages above');
    }

  } catch (error) {
    console.error('\n💥 Execution error:', error);
  }
}

createAndTest();







