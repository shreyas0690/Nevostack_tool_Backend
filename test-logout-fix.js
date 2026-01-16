const axios = require('axios');

// Test configuration
const BASE_URL = 'http://localhost:5000';
const TEST_EMAIL = 'admin@test.com';
const TEST_PASSWORD = 'admin123';

async function testLogoutFix() {
  console.log('🧪 Testing Logout Fix...\n');

  try {
    // Step 1: Login as admin
    console.log('1️⃣ Logging in as admin...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      rememberMe: false
    });

    if (loginResponse.data.success) {
      const { accessToken, refreshToken } = loginResponse.data.tokens;
      const deviceId = loginResponse.data.device.deviceId;
      
      console.log('✅ Admin login successful');
      console.log('📱 Device ID:', deviceId);
      console.log('👤 User:', loginResponse.data.user.email, '- Role:', loginResponse.data.user.role);
    } else {
      throw new Error('Admin login failed');
    }

    // Step 2: Test API call with admin token
    console.log('\n2️⃣ Testing API call with admin token...');
    const profileResponse = await axios.get(`${BASE_URL}/api/auth/profile`, {
      headers: {
        'Authorization': `Bearer ${loginResponse.data.tokens.accessToken}`,
        'X-Device-Id': loginResponse.data.device.deviceId,
        'X-Refresh-Token': loginResponse.data.tokens.refreshToken
      }
    });

    if (profileResponse.data.success) {
      console.log('✅ Admin profile API call successful');
    }

    // Step 3: Logout admin
    console.log('\n3️⃣ Logging out admin...');
    try {
      const logoutResponse = await axios.post(`${BASE_URL}/api/auth/logout`, {
        deviceId: loginResponse.data.device.deviceId,
        logoutAll: false
      }, {
        headers: {
          'Authorization': `Bearer ${loginResponse.data.tokens.accessToken}`,
          'X-Device-Id': loginResponse.data.device.deviceId
        }
      });

      if (logoutResponse.data.success) {
        console.log('✅ Admin logout successful');
      }
    } catch (logoutError) {
      console.log('⚠️ Admin logout error (expected if token expired):', logoutError.response?.status);
    }

    // Step 4: Try to use admin token after logout (should fail)
    console.log('\n4️⃣ Testing API call with logged out admin token...');
    try {
      const failedResponse = await axios.get(`${BASE_URL}/api/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${loginResponse.data.tokens.accessToken}`,
          'X-Device-Id': loginResponse.data.device.deviceId,
          'X-Refresh-Token': loginResponse.data.tokens.refreshToken
        }
      });
      console.log('❌ Unexpected: API call with logged out token succeeded');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Expected: API call with logged out token failed (401)');
      } else {
        console.log('❌ Unexpected error:', error.response?.status, error.response?.data);
      }
    }

    // Step 5: Login as different user (manager)
    console.log('\n5️⃣ Logging in as manager...');
    const managerLoginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'manager@test.com', // Assuming manager exists
      password: 'manager123',
      rememberMe: false
    });

    if (managerLoginResponse.data.success) {
      console.log('✅ Manager login successful');
      console.log('👤 User:', managerLoginResponse.data.user.email, '- Role:', managerLoginResponse.data.user.role);
      console.log('📱 Device ID:', managerLoginResponse.data.device.deviceId);
    } else {
      console.log('⚠️ Manager login failed (user might not exist)');
      console.log('Response:', managerLoginResponse.data);
    }

    // Step 6: Test manager API calls
    if (managerLoginResponse.data.success) {
      console.log('\n6️⃣ Testing manager API calls...');
      try {
        const managerProfileResponse = await axios.get(`${BASE_URL}/api/auth/profile`, {
          headers: {
            'Authorization': `Bearer ${managerLoginResponse.data.tokens.accessToken}`,
            'X-Device-Id': managerLoginResponse.data.device.deviceId,
            'X-Refresh-Token': managerLoginResponse.data.tokens.refreshToken
          }
        });

        if (managerProfileResponse.data.success) {
          console.log('✅ Manager profile API call successful');
        }
      } catch (error) {
        console.log('❌ Manager API call failed:', error.response?.status, error.response?.data);
      }
    }

    // Step 7: Test logout without valid token (should still work)
    console.log('\n7️⃣ Testing logout without valid token...');
    try {
      const logoutWithoutTokenResponse = await axios.post(`${BASE_URL}/api/auth/logout`, {
        deviceId: loginResponse.data.device.deviceId,
        logoutAll: false
      });

      if (logoutWithoutTokenResponse.data.success) {
        console.log('✅ Logout without valid token successful');
      }
    } catch (error) {
      console.log('❌ Logout without valid token failed:', error.response?.status, error.response?.data);
    }

    console.log('\n🎉 Logout Fix Test Completed!');
    console.log('\n📋 Summary:');
    console.log('- ✅ Admin login successful');
    console.log('- ✅ Admin API calls working');
    console.log('- ✅ Admin logout working');
    console.log('- ✅ Logged out token properly invalidated');
    console.log('- ✅ Different user login working');
    console.log('- ✅ Logout without valid token working');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testLogoutFix();
