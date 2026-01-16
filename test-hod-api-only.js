const axios = require('axios');

// Test HOD API endpoints without creating test data
async function testHODAPIsOnly() {
  try {
    console.log('🔍 Testing HOD API endpoints...');

    const baseURL = 'http://localhost:5000/api';

    // First, login to get authentication token
    console.log('🔐 Logging in as HOD...');
    const loginResponse = await axios.post(`${baseURL}/auth/login`, {
      email: 'hod@test.com',
      password: 'password123'
    });

    console.log('Login response:', loginResponse.data);

    if (!loginResponse.data.success) {
      throw new Error('Login failed: ' + JSON.stringify(loginResponse.data));
    }

    // Try different possible token field names
    const token = loginResponse.data.token || 
                  loginResponse.data.accessToken || 
                  loginResponse.data.data?.token || 
                  loginResponse.data.data?.accessToken;
                  
    if (!token) {
      console.log('Available fields in login response:', Object.keys(loginResponse.data));
      throw new Error('No token found in login response');
    }

    const headers = { Authorization: `Bearer ${token}` };
    console.log('✅ Login successful, token:', token.substring(0, 20) + '...');

    // Test HOD overview endpoint
    console.log('\n📊 Testing HOD overview endpoint...');
    try {
      const overviewResponse = await axios.get(`${baseURL}/analytics/hod/overview`, {
        headers
      });

      if (overviewResponse.data.success) {
        console.log('✅ HOD overview API working');
        console.log('📈 Data preview:', JSON.stringify({
          department: overviewResponse.data.data.department?.name,
          totalMembers: overviewResponse.data.data.members?.total,
          totalTasks: overviewResponse.data.data.tasks?.total,
          completedTasks: overviewResponse.data.data.tasks?.completed,
          pendingLeaves: overviewResponse.data.data.leaves?.pending
        }, null, 2));
      } else {
        console.log('❌ HOD overview API failed:', overviewResponse.data);
      }
    } catch (error) {
      console.log('❌ HOD overview API error:', error.response?.data || error.message);
    }

    // Test HOD tasks endpoint
    console.log('\n📋 Testing HOD tasks endpoint...');
    try {
      const tasksResponse = await axios.get(`${baseURL}/analytics/hod/tasks`, {
        headers
      });

      if (tasksResponse.data.success) {
        console.log('✅ HOD tasks API working');
        console.log('📊 Tasks found:', tasksResponse.data.data.length);
        console.log('📝 Sample tasks:', JSON.stringify(tasksResponse.data.data.slice(0, 2), null, 2));
      } else {
        console.log('❌ HOD tasks API failed:', tasksResponse.data);
      }
    } catch (error) {
      console.log('❌ HOD tasks API error:', error.response?.data || error.message);
    }

    // Test department members endpoint
    console.log('\n👥 Testing department members endpoint...');
    try {
      const membersResponse = await axios.get(`${baseURL}/analytics/hod/department/members`, {
        headers
      });

      if (membersResponse.data.success) {
        console.log('✅ Department members API working');
        console.log('👤 Members found:', membersResponse.data.data.length);
        console.log('👥 Sample members:', JSON.stringify(
          membersResponse.data.data.slice(0, 2).map(m => ({ 
            name: m.name, 
            email: m.email, 
            role: m.role,
            totalTasks: m.tasks?.total || 0
          })), null, 2
        ));
      } else {
        console.log('❌ Department members API failed:', membersResponse.data);
      }
    } catch (error) {
      console.log('❌ Department members API error:', error.response?.data || error.message);
    }

    console.log('\n🎉 HOD API tests completed!');
    return true;

  } catch (error) {
    console.error('❌ HOD API test failed:');
    console.error('Error message:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return false;
  }
}

// Main execution
async function main() {
  try {
    console.log('🚀 Starting HOD API Only Test\n');

    const apiTestPassed = await testHODAPIsOnly();

    if (apiTestPassed) {
      console.log('\n✅ HOD API Test Completed Successfully!');
      console.log('\n📍 Next Steps:');
      console.log('1. Open frontend application: http://localhost:3000');
      console.log('2. Login with: hod@test.com / password123');
      console.log('3. Navigate to HOD Dashboard');
      console.log('4. Verify that real data is displayed instead of mock data');
    } else {
      console.log('\n❌ HOD API Test Failed');
      console.log('Please check the backend server and try again.');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Handle async errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (require.main === module) {
  main();
}

module.exports = testHODAPIsOnly;
