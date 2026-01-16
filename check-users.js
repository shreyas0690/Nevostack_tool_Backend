const mongoose = require('mongoose');
require('./lib/mongodb');

const User = require('./models/User');
const Department = require('./models/Department');

async function checkUsers() {
  try {
    console.log('🔍 Checking users and departments...');

    const users = await User.find({}).select('name email role departmentId managerId');
    console.log('\n👥 Users:');
    users.forEach(user => {
      console.log(`  - ${user.name} (${user.email}): ${user.role} | Dept: ${user.departmentId} | Manager: ${user.managerId}`);
    });

    const departments = await Department.find({}).select('name headId managerIds memberIds');
    console.log('\n🏢 Departments:');
    departments.forEach(dept => {
      console.log(`  - ${dept.name}: Head: ${dept.headId} | Managers: ${dept.managerIds?.length || 0} | Members: ${dept.memberIds?.length || 0}`);
    });

    const hod = users.find(u => u.role === 'department_head');
    if (hod) {
      console.log('\n👑 Found HOD:', hod.name, hod._id);
      console.log('Department ID:', hod.departmentId);

      const dept = departments.find(d => d._id.toString() === hod.departmentId.toString());
      if (dept) {
        console.log('Department headId:', dept.headId);
        console.log('Department headId matches HOD:', dept.headId?.toString() === hod._id.toString());
      }
    } else {
      console.log('\n❌ No HOD found');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }

  process.exit(0);
}

checkUsers();
