// Test script for Monthly Leave Summary API
const axios = require('axios');

const API_BASE = 'http://localhost:5000';
const testUserToken = 'your-test-token-here'; // Replace with actual token

async function testMonthlySummary() {
  try {
    console.log('🧪 Testing Monthly Leave Summary API...\n');

    // Test with default current month
    console.log('1. Testing current month summary...');
    const response = await axios.get(`${API_BASE}/api/leaves/monthly-summary`, {
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ API Response:', {
      success: response.data.success,
      message: response.data.message,
      totalLeaves: response.data.data?.leaves?.length || 0,
      summary: response.data.data?.summary
    });

    // Test with specific month/year
    console.log('\n2. Testing specific month (September 2025)...');
    const specificResponse = await axios.get(`${API_BASE}/api/leaves/monthly-summary?year=2025&month=9`, {
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Specific Month Response:', {
      success: specificResponse.data.success,
      message: specificResponse.data.message,
      totalLeaves: specificResponse.data.data?.leaves?.length || 0,
      summary: specificResponse.data.data?.summary
    });

    console.log('\n🎉 Monthly Leave Summary API test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testMonthlySummary();


