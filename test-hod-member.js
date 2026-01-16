const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function testHodToMember() {
  try {
    console.log('🧪 Testing HOD to Member conversion...');

    // First login to get token - try different credentials
    let token;
    try {
      const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
        email: 'admin@example.com',
        password: 'admin123'
      });
      token = loginResponse.data.token;
      console.log('✅ Logged in with admin@example.com');
    } catch (e1) {
      try {
        const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
          email: 'jahid@example.com',
          password: 'password123'
        });
        token = loginResponse.data.token;
        console.log('✅ Logged in with jahid@example.com');
      } catch (e2) {
        console.log('❌ Could not login with test credentials');
        return;
      }
    }

    // Get all users
    const usersResponse = await axios.get(`${BASE_URL}/users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const hod = usersResponse.data.users.find(u => u.role === 'department_head');
    if (!hod) {
      console.log('❌ No HOD found');
      return;
    }

    console.log('📊 Found HOD:', hod._id, hod.role, hod.departmentId);

    // Get department details
    const deptResponse = await axios.get(`${BASE_URL}/departments/${hod.departmentId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('📊 Department:', deptResponse.data.department._id, 'headId:', deptResponse.data.department.headId);

    // Convert HOD to Member
    console.log('🔄 Converting HOD to Member...');
    const updateResponse = await axios.put(`${BASE_URL}/users/${hod._id}`, {
      role: 'member',
      departmentId: hod.departmentId
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('✅ Update successful');

    // Check updated user
    const updatedUserResponse = await axios.get(`${BASE_URL}/users/${hod._id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const updatedUser = updatedUserResponse.data.user;
    console.log('📊 Updated User:');
    console.log('  - Role:', updatedUser.role);
    console.log('  - DepartmentId:', updatedUser.departmentId);
    console.log('  - ManagerId:', updatedUser.managerId);
    console.log('  - ManagedManagerIds:', updatedUser.managedManagerIds?.length || 0);
    console.log('  - ManagedMemberIds:', updatedUser.managedMemberIds?.length || 0);

    // Check updated department
    const updatedDeptResponse = await axios.get(`${BASE_URL}/departments/${hod.departmentId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const updatedDept = updatedDeptResponse.data.department;
    console.log('📊 Updated Department:');
    console.log('  - HeadId:', updatedDept.headId);
    console.log('  - ManagerIds:', updatedDept.managerIds?.length || 0);
    console.log('  - MemberIds:', updatedDept.memberIds?.length || 0);

    // Check if there are other HODs in this department
    const allUsersResponse = await axios.get(`${BASE_URL}/users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const existingHods = allUsersResponse.data.users.filter(u =>
      u.role === 'department_head' &&
      u.departmentId === hod.departmentId &&
      u._id !== hod._id
    );

    if (existingHods.length > 0) {
      console.log('📊 Existing HODs in department:', existingHods.length);
      for (const existingHod of existingHods) {
        const hodDetailsResponse = await axios.get(`${BASE_URL}/users/${existingHod._id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const hodDetails = hodDetailsResponse.data.user;
        console.log(`  - HOD ${existingHod._id}: managedMemberIds = ${hodDetails.managedMemberIds?.length || 0}`);
        console.log(`    - Contains demoted HOD: ${hodDetails.managedMemberIds?.includes(hod._id)}`);
      }
    } else {
      console.log('❌ No existing HODs found in department');
    }

    // Verify the conversion
    const success =
      updatedUser.role === 'member' &&
      updatedDept.headId !== hod._id &&
      updatedDept.memberIds?.includes(hod._id);

    console.log('\n🎯 Verification:');
    console.log('  ✅ Role changed to member:', updatedUser.role === 'member');
    console.log('  ✅ Department head cleared:', updatedDept.headId !== hod._id);
    console.log('  ✅ Added to memberIds:', updatedDept.memberIds?.includes(hod._id));
    console.log('  ✅ Managed relationships cleared:', (updatedUser.managedManagerIds?.length || 0) === 0 && (updatedUser.managedMemberIds?.length || 0) === 0);

    if (success) {
      console.log('\n🎉 HOD to Member conversion successful!');
    } else {
      console.log('\n❌ HOD to Member conversion failed!');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testHodToMember();
