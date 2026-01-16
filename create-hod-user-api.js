const axios = require('axios');

async function createHODUserViaAPI() {
  try {
    console.log('🚀 Creating HOD user via API...');
    
    const baseURL = 'http://localhost:5000/api';
    
    // Try to register a company and HOD user
    console.log('🏢 Registering company and HOD user...');
    
    const registrationData = {
      // Company details
      companyName: 'Test Company HOD',
      companyEmail: 'admin@testhod.com',
      companyDomain: 'testhod.nevostack.com',
      
      // HOD user details
      firstName: 'John',
      lastName: 'HOD',
      email: 'hod@test.com',
      password: 'password123',
      role: 'department_head',
      
      // Optional department
      departmentName: 'Test Department'
    };
    
    try {
      const registerResponse = await axios.post(`${baseURL}/auth/register-company`, registrationData);
      
      console.log('✅ Registration successful!');
      console.log('Response:', JSON.stringify(registerResponse.data, null, 2));
      
      return registerResponse.data;
    } catch (regError) {
      console.log('❌ Company registration failed:');
      console.log('Status:', regError.response?.status);
      console.log('Data:', JSON.stringify(regError.response?.data, null, 2));
      console.log('Message:', regError.message);
      
      // Try individual user registration instead
      console.log('🔄 Trying individual user registration...');
      
      try {
        const userRegResponse = await axios.post(`${baseURL}/auth/register`, {
          firstName: 'John',
          lastName: 'HOD',
          email: 'hod@test.com',
          password: 'password123',
          role: 'department_head'
        });
        
        console.log('✅ User registration successful!');
        console.log('Response:', JSON.stringify(userRegResponse.data, null, 2));
        
        return userRegResponse.data;
      } catch (userRegError) {
        console.log('❌ User registration also failed:');
        console.log('Status:', userRegError.response?.status);
        console.log('Data:', JSON.stringify(userRegError.response?.data, null, 2));
        console.log('Message:', userRegError.message);
        throw new Error('Both registration methods failed');
      }
    }
    
  } catch (error) {
    console.error('❌ Failed to create HOD user:', error.message);
    throw error;
  }
}

async function testHODLogin() {
  try {
    console.log('\n🔐 Testing HOD login...');
    
    const baseURL = 'http://localhost:5000/api';
    
    const loginResponse = await axios.post(`${baseURL}/auth/login`, {
      email: 'hod@test.com',
      password: 'password123'
    });
    
    console.log('✅ Login successful!');
    console.log('Response:', JSON.stringify(loginResponse.data, null, 2));
    
    // Test the HOD overview API
    const token = loginResponse.data.token || loginResponse.data.accessToken || loginResponse.data.data?.token;
    
    if (token) {
      console.log('\n📊 Testing HOD overview API...');
      
      const headers = { Authorization: `Bearer ${token}` };
      
      try {
        const overviewResponse = await axios.get(`${baseURL}/analytics/hod/overview`, { headers });
        
        console.log('✅ HOD overview API working!');
        console.log('Data:', JSON.stringify(overviewResponse.data, null, 2));
        
      } catch (apiError) {
        console.log('❌ HOD overview API failed:', apiError.response?.data || apiError.message);
      }
    }
    
  } catch (loginError) {
    console.log('❌ Login failed:', loginError.response?.data || loginError.message);
    throw loginError;
  }
}

async function main() {
  try {
    console.log('🚀 Starting HOD User Creation and Test\n');
    
    // First try to create the HOD user
    await createHODUserViaAPI();
    
    // Then test login and API
    await testHODLogin();
    
    console.log('\n🎉 HOD setup completed successfully!');
    console.log('\n📍 Next Steps:');
    console.log('1. Open frontend application: http://localhost:8080');
    console.log('2. Login with: hod@test.com / password123');
    console.log('3. Navigate to HOD Dashboard');
    console.log('4. Check if real data is displayed');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.log('\n🔄 Manual setup may be required.');
  }
}

if (require.main === module) {
  main();
}

module.exports = { createHODUserViaAPI, testHODLogin };
