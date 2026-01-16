const axios = require('axios');

async function testDepartmentsAPI() {
  try {
    console.log('🧪 Testing Departments API...');
    
    // Test 1: Health Check
    console.log('\n1️⃣ Testing Health Check...');
    const healthResponse = await axios.get('http://localhost:5000/health');
    console.log('✅ Health Check:', healthResponse.data);
    
    // Test 2: Try to get departments without auth (should fail)
    console.log('\n2️⃣ Testing Departments API without auth...');
    try {
      const deptResponse = await axios.get('http://localhost:5000/api/departments');
      console.log('✅ Departments (no auth):', deptResponse.data);
    } catch (error) {
      console.log('❌ Expected error (no auth):', error.response?.status, error.response?.data?.error);
    }
    
    // Test 3: Create a test user and get token
    console.log('\n3️⃣ Testing with authentication...');
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    
    if (loginResponse.data.token) {
      console.log('✅ Login successful, token received');
      
      // Test 4: Get departments with auth
      const authDeptResponse = await axios.get('http://localhost:5000/api/departments', {
        headers: {
          'Authorization': `Bearer ${loginResponse.data.token}`
        }
      });
      console.log('✅ Departments (with auth):', authDeptResponse.data);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testDepartmentsAPI();

















































































