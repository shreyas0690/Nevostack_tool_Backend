const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:5000/api';
let authToken = '';

// Test data storage
let testUsers = {};
let testDepartments = {};

// Helper function to make API requests
async function makeRequest(method, endpoint, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        ...headers
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`❌ API Error: ${method} ${endpoint}`, error.response?.data || error.message);
    throw error;
  }
}

// Setup function
async function setupTestData() {
  console.log('🔧 Setting up test data for HOD to Member conversion...');

  try {
    // Login as admin
    const loginResponse = await makeRequest('POST', '/auth/login', {
      email: 'admin@example.com',
      password: 'admin123'
    });
    authToken = loginResponse.token;
    console.log('✅ Admin login successful');

    // Create test department
    const deptResponse = await makeRequest('POST', '/departments', {
      name: 'Test Department for HOD to Member',
      description: 'Department for testing HOD to Member conversion'
    });
    testDepartments.dept1 = deptResponse.department;
    console.log('✅ Test department created');

    // Create HOD for the department
    const hodResponse = await makeRequest('POST', '/users', {
      name: 'Test HOD',
      email: 'testhod@example.com',
      password: 'password123',
      role: 'department_head',
      departmentId: testDepartments.dept1._id
    });
    testUsers.hod1 = hodResponse.user;
    console.log('✅ Test HOD created');

    // Update department head
    await makeRequest('PUT', `/departments/${testDepartments.dept1._id}`, {
      headId: testUsers.hod1._id
    });
    console.log('✅ Department head assigned');

    // Create another HOD for testing existing HOD scenario
    const hod2Response = await makeRequest('POST', '/users', {
      name: 'Test HOD 2',
      email: 'testhod2@example.com',
      password: 'password123',
      role: 'department_head',
      departmentId: testDepartments.dept1._id
    });
    testUsers.hod2 = hod2Response.user;
    console.log('✅ Test HOD 2 created');

    // Create some members for the department
    const member1Response = await makeRequest('POST', '/users', {
      name: 'Test Member 1',
      email: 'testmember1@example.com',
      password: 'password123',
      role: 'member',
      departmentId: testDepartments.dept1._id,
      managerId: testUsers.hod1._id
    });
    testUsers.member1 = member1Response.user;
    console.log('✅ Test Member 1 created');

    const member2Response = await makeRequest('POST', '/users', {
      name: 'Test Member 2',
      email: 'testmember2@example.com',
      password: 'password123',
      role: 'member',
      departmentId: testDepartments.dept1._id,
      managerId: testUsers.hod1._id
    });
    testUsers.member2 = member2Response.user;
    console.log('✅ Test Member 2 created');

    // Add members to department
    await makeRequest('PUT', `/departments/${testDepartments.dept1._id}`, {
      memberIds: [testUsers.member1._id, testUsers.member2._id]
    });
    console.log('✅ Members added to department');

    // Add members to HOD's managedMemberIds
    await makeRequest('PUT', `/users/${testUsers.hod1._id}`, {
      managedMemberIds: [testUsers.member1._id, testUsers.member2._id]
    });
    console.log('✅ Members added to HOD managedMemberIds');

    console.log('🎉 Test data setup complete!');
    return true;

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    return false;
  }
}

// Test Scenario 1: HOD to Member (with existing HOD)
async function testHodToMemberWithExistingHod() {
  console.log('\n🧪 Testing Scenario 1: HOD to Member (with existing HOD)');
  console.log('=' .repeat(60));

  try {
    // Get initial state
    const initialHod = await makeRequest('GET', `/users/${testUsers.hod1._id}`);
    const initialDept = await makeRequest('GET', `/departments/${testDepartments.dept1._id}`);
    const initialHod2 = await makeRequest('GET', `/users/${testUsers.hod2._id}`);

    console.log('📊 Initial State:');
    console.log(`- HOD1: role = ${initialHod.user.role}, departmentId = ${initialHod.user.departmentId}`);
    console.log(`- HOD1: managedMemberIds = ${initialHod.user.managedMemberIds?.length || 0}`);
    console.log(`- Department: headId = ${initialDept.department.headId}, memberIds = ${initialDept.department.memberIds?.length || 0}`);
    console.log(`- HOD2: role = ${initialHod2.user.role}, managedMemberIds = ${initialHod2.user.managedMemberIds?.length || 0}`);

    // Convert HOD1 to Member
    const updateResponse = await makeRequest('PUT', `/users/${testUsers.hod1._id}`, {
      role: 'member',
      departmentId: testDepartments.dept1._id
    });

    console.log('✅ HOD to Member conversion successful');

    // Verify changes
    const updatedHod = await makeRequest('GET', `/users/${testUsers.hod1._id}`);
    const updatedDept = await makeRequest('GET', `/departments/${testDepartments.dept1._id}`);
    const updatedHod2 = await makeRequest('GET', `/users/${testUsers.hod2._id}`);

    console.log('\n📊 Final State:');
    console.log(`- HOD1: role = ${updatedHod.user.role}, departmentId = ${updatedHod.user.departmentId}, managerId = ${updatedHod.user.managerId}`);
    console.log(`- HOD1: managedMemberIds = ${updatedHod.user.managedMemberIds?.length || 0}`);
    console.log(`- Department: headId = ${updatedDept.department.headId}, memberIds = ${updatedDept.department.memberIds?.length || 0}`);
    console.log(`- HOD2: managedMemberIds = ${updatedHod2.user.managedMemberIds?.length || 0}`);

    // Verifications
    if (updatedHod.user.role === 'member') {
      console.log('✅ HOD role updated to member');
    } else {
      console.log('❌ HOD role not updated to member');
    }

    if (updatedHod.user.departmentId === testDepartments.dept1._id) {
      console.log('✅ HOD assigned to department');
    } else {
      console.log('❌ HOD not assigned to department');
    }

    if (updatedHod.user.managerId === testUsers.hod2._id) {
      console.log('✅ HOD assigned to existing HOD as manager');
    } else {
      console.log('❌ HOD not assigned to existing HOD as manager');
    }

    if (updatedHod.user.managedMemberIds?.length === 0) {
      console.log('✅ HOD managedMemberIds cleared');
    } else {
      console.log('❌ HOD managedMemberIds not cleared');
    }

    if (updatedDept.department.headId === null) {
      console.log('✅ Department headId cleared');
    } else {
      console.log('❌ Department headId not cleared');
    }

    if (updatedDept.department.memberIds?.includes(testUsers.hod1._id)) {
      console.log('✅ HOD added to department memberIds');
    } else {
      console.log('❌ HOD not added to department memberIds');
    }

    if (updatedHod2.user.managedMemberIds?.includes(testUsers.hod1._id)) {
      console.log('✅ HOD added to existing HOD managedMemberIds');
    } else {
      console.log('❌ HOD not added to existing HOD managedMemberIds');
    }

    console.log('🎉 HOD to Member test completed successfully!');

  } catch (error) {
    console.log('❌ HOD to Member test failed:', error.message);
  }
}

// Test Scenario 2: HOD to Member (without existing HOD)
async function testHodToMemberWithoutExistingHod() {
  console.log('\n🧪 Testing Scenario 2: HOD to Member (without existing HOD)');
  console.log('=' .repeat(60));

  try {
    // Create a new department without HOD
    const dept2Response = await makeRequest('POST', '/departments', {
      name: 'Test Department 2 - No HOD',
      description: 'Department without HOD for testing'
    });
    testDepartments.dept2 = dept2Response.department;
    console.log('✅ Test Department 2 created');

    // Create HOD for this department
    const hod3Response = await makeRequest('POST', '/users', {
      name: 'Test HOD 3',
      email: 'testhod3@example.com',
      password: 'password123',
      role: 'department_head',
      departmentId: testDepartments.dept2._id
    });
    testUsers.hod3 = hod3Response.user;
    console.log('✅ Test HOD 3 created');

    // Update department head
    await makeRequest('PUT', `/departments/${testDepartments.dept2._id}`, {
      headId: testUsers.hod3._id
    });
    console.log('✅ Department 2 head assigned');

    // Get initial state
    const initialHod = await makeRequest('GET', `/users/${testUsers.hod3._id}`);
    const initialDept = await makeRequest('GET', `/departments/${testDepartments.dept2._id}`);

    console.log('📊 Initial State:');
    console.log(`- HOD3: role = ${initialHod.user.role}, departmentId = ${initialHod.user.departmentId}`);
    console.log(`- Department2: headId = ${initialDept.department.headId}, memberIds = ${initialDept.department.memberIds?.length || 0}`);

    // Convert HOD3 to Member
    const updateResponse = await makeRequest('PUT', `/users/${testUsers.hod3._id}`, {
      role: 'member',
      departmentId: testDepartments.dept2._id
    });

    console.log('✅ HOD to Member conversion successful');

    // Verify changes
    const updatedHod = await makeRequest('GET', `/users/${testUsers.hod3._id}`);
    const updatedDept = await makeRequest('GET', `/departments/${testDepartments.dept2._id}`);

    console.log('\n📊 Final State:');
    console.log(`- HOD3: role = ${updatedHod.user.role}, departmentId = ${updatedHod.user.departmentId}, managerId = ${updatedHod.user.managerId}`);
    console.log(`- Department2: headId = ${updatedDept.department.headId}, memberIds = ${updatedDept.department.memberIds?.length || 0}`);

    // Verifications
    if (updatedHod.user.role === 'member') {
      console.log('✅ HOD role updated to member');
    } else {
      console.log('❌ HOD role not updated to member');
    }

    if (updatedHod.user.departmentId === testDepartments.dept2._id) {
      console.log('✅ HOD assigned to department');
    } else {
      console.log('❌ HOD not assigned to department');
    }

    if (updatedHod.user.managerId === null) {
      console.log('✅ HOD managerId set to null (no existing HOD)');
    } else {
      console.log('❌ HOD managerId not set to null');
    }

    if (updatedDept.department.headId === null) {
      console.log('✅ Department headId cleared');
    } else {
      console.log('❌ Department headId not cleared');
    }

    if (updatedDept.department.memberIds?.includes(testUsers.hod3._id)) {
      console.log('✅ HOD added to department memberIds');
    } else {
      console.log('❌ HOD not added to department memberIds');
    }

    console.log('🎉 HOD to Member (no existing HOD) test completed successfully!');

  } catch (error) {
    console.log('❌ HOD to Member (no existing HOD) test failed:', error.message);
  }
}

// Cleanup function
async function cleanupTestData() {
  console.log('\n🧹 Cleaning up test data...');

  try {
    // Delete test users
    for (const [key, user] of Object.entries(testUsers)) {
      await makeRequest('DELETE', `/users/${user._id}`);
      console.log(`✅ Deleted test user: ${key}`);
    }

    // Delete test departments
    for (const [key, dept] of Object.entries(testDepartments)) {
      await makeRequest('DELETE', `/departments/${dept._id}`);
      console.log(`✅ Deleted test department: ${key}`);
    }

    console.log('🎉 Cleanup completed!');

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  }
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting HOD to Member Tests');
  console.log('=' .repeat(80));

  try {
    // Setup
    const setupSuccess = await setupTestData();
    if (!setupSuccess) {
      console.log('❌ Setup failed, aborting tests');
      return;
    }

    // Run all test scenarios
    await testHodToMemberWithExistingHod();
    await testHodToMemberWithoutExistingHod();

    console.log('\n🎉 All HOD to Member tests completed!');

  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
  } finally {
    // Cleanup
    await cleanupTestData();
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  testHodToMemberWithExistingHod,
  testHodToMemberWithoutExistingHod
};
