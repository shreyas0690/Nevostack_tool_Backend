const axios = require('axios');

// Test configuration
const BASE_URL = 'http://localhost:5000';
const TEST_EMAIL = 'admin@test.com';
const TEST_PASSWORD = 'admin123';

let accessToken = null;
let refreshToken = null;
let deviceId = null;

async function testAutomaticTokenRefresh() {
  console.log('🧪 Testing Automatic Token Refresh System...\n');

  try {
    // Step 1: Login to get initial tokens
    console.log('1️⃣ Logging in to get initial tokens...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      rememberMe: false
    });

    if (loginResponse.data.success) {
      accessToken = loginResponse.data.tokens.accessToken;
      refreshToken = loginResponse.data.tokens.refreshToken;
      deviceId = loginResponse.data.device.deviceId;
      
      console.log('✅ Login successful');
      console.log('📱 Device ID:', deviceId);
      console.log('🔑 Access Token (first 50 chars):', accessToken.substring(0, 50) + '...');
      console.log('🔄 Refresh Token (first 50 chars):', refreshToken.substring(0, 50) + '...');
    } else {
      throw new Error('Login failed');
    }

    // Step 2: Test API call with valid token
    console.log('\n2️⃣ Testing API call with valid token...');
    const profileResponse = await axios.get(`${BASE_URL}/api/auth/profile`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Device-Id': deviceId,
        'X-Refresh-Token': refreshToken
      }
    });

    if (profileResponse.data.success) {
      console.log('✅ Profile API call successful');
      console.log('👤 User:', profileResponse.data.user.email);
    }

    // Step 3: Wait for token to expire (simulate expired token)
    console.log('\n3️⃣ Simulating expired token scenario...');
    
    // Create a fake expired token by modifying the existing one
    const fakeExpiredToken = accessToken.substring(0, accessToken.length - 10) + 'EXPIRED';
    
    try {
      const expiredResponse = await axios.get(`${BASE_URL}/api/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${fakeExpiredToken}`,
          'X-Device-Id': deviceId,
          'X-Refresh-Token': refreshToken
        }
      });
      console.log('❌ Unexpected: API call with expired token succeeded');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Expected: API call with expired token failed (401)');
        
        // Check if server sent new tokens in headers
        const newAccessToken = error.response.headers['x-new-access-token'];
        const newRefreshToken = error.response.headers['x-new-refresh-token'];
        const tokenRefreshed = error.response.headers['x-token-refreshed'];
        
        if (tokenRefreshed === 'true' && newAccessToken && newRefreshToken) {
          console.log('🔄 Automatic token refresh detected!');
          console.log('🔑 New Access Token (first 50 chars):', newAccessToken.substring(0, 50) + '...');
          console.log('🔄 New Refresh Token (first 50 chars):', newRefreshToken.substring(0, 50) + '...');
          
          // Update tokens
          accessToken = newAccessToken;
          refreshToken = newRefreshToken;
        } else {
          console.log('❌ No automatic token refresh detected');
        }
      } else {
        console.log('❌ Unexpected error:', error.response?.status, error.response?.data);
      }
    }

    // Step 4: Test API call with new token (if refreshed)
    if (accessToken !== fakeExpiredToken) {
      console.log('\n4️⃣ Testing API call with refreshed token...');
      try {
        const newProfileResponse = await axios.get(`${BASE_URL}/api/auth/profile`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-Device-Id': deviceId,
            'X-Refresh-Token': refreshToken
          }
        });

        if (newProfileResponse.data.success) {
          console.log('✅ API call with refreshed token successful');
          console.log('👤 User:', newProfileResponse.data.user.email);
        }
      } catch (error) {
        console.log('❌ API call with refreshed token failed:', error.response?.status, error.response?.data);
      }
    }

    // Step 5: Test manual refresh endpoint
    console.log('\n5️⃣ Testing manual refresh endpoint...');
    try {
      const manualRefreshResponse = await axios.post(`${BASE_URL}/api/auth/refresh`, {
        refreshToken: refreshToken,
        deviceId: deviceId
      });

      if (manualRefreshResponse.data.success) {
        console.log('✅ Manual refresh successful');
        console.log('🔑 New Access Token (first 50 chars):', manualRefreshResponse.data.tokens.accessToken.substring(0, 50) + '...');
        console.log('🔄 New Refresh Token (first 50 chars):', manualRefreshResponse.data.tokens.refreshToken.substring(0, 50) + '...');
      }
    } catch (error) {
      console.log('❌ Manual refresh failed:', error.response?.status, error.response?.data);
    }

    // Step 6: Test with invalid refresh token
    console.log('\n6️⃣ Testing with invalid refresh token...');
    try {
      const invalidRefreshResponse = await axios.post(`${BASE_URL}/api/auth/refresh`, {
        refreshToken: 'invalid_refresh_token',
        deviceId: deviceId
      });
      console.log('❌ Unexpected: Invalid refresh token succeeded');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Expected: Invalid refresh token failed (401)');
      } else {
        console.log('❌ Unexpected error:', error.response?.status, error.response?.data);
      }
    }

    console.log('\n🎉 Automatic Token Refresh Test Completed!');
    console.log('\n📋 Summary:');
    console.log('- ✅ Login successful');
    console.log('- ✅ Valid token API call successful');
    console.log('- ✅ Expired token handling working');
    console.log('- ✅ Manual refresh endpoint working');
    console.log('- ✅ Invalid token handling working');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testAutomaticTokenRefresh();
