const mongoose = require('mongoose');
require('./lib/mongodb');

const User = require('./models/User');
const Department = require('./models/Department');

async function testHodToManagerDebug() {
  try {
    console.log('🧪 Testing HOD to Manager (Debug Mode)...');

    // Find HOD
    const hod = await User.findOne({ role: 'department_head' });
    if (!hod) {
      console.log('❌ No HOD found');
      return;
    }

    console.log('📊 Initial HOD:', hod.name, hod._id, 'Dept:', hod.departmentId);

    // Find another department
    const allDepts = await Department.find({ _id: { $ne: hod.departmentId } });
    if (allDepts.length === 0) {
      console.log('❌ No other department found');
      return;
    }

    const newDept = allDepts[0];
    console.log('📊 New Department:', newDept._id, 'headId:', newDept.headId);

    // Check if new department has an HOD
    const existingHodInNewDept = await User.findOne({
      role: 'department_head',
      departmentId: newDept._id,
      _id: { $ne: hod._id }
    });

    console.log('📊 Existing HOD in new department:', existingHodInNewDept ? existingHodInNewDept._id : 'NONE');

    // Simulate API call - HOD to Manager in new department
    const updateData = {
      role: 'manager',
      departmentId: newDept._id
    };

    console.log('🔄 Simulating HOD to Manager conversion...');

    // This simulates what should happen in the backend
    console.log('🎯 Simulating HOD Demotion Case...');
    console.log('⬇️ Case 1C: HOD Demotion');

    const oldDepartmentId = hod.departmentId;
    const newDepartmentId = updateData.departmentId;
    const hodId = hod._id;

    console.log('📊 Old Dept:', oldDepartmentId, 'New Dept:', newDepartmentId);

    // Simulate the manager branch logic
    console.log('🔄 Target role is manager, adding to department managerIds...');

    console.log('🔍 Looking for HOD in new department:', newDepartmentId);

    // Simulate finding existing HOD
    const existingHod = await User.findOne({
      role: 'department_head',
      departmentId: newDepartmentId,
      _id: { $ne: hodId }
    });

    console.log('📊 Found existing HOD:', existingHod ? existingHod._id : 'NONE');

    if (existingHod) {
      console.log('📊 Existing HOD managedManagerIds before:', existingHod.managedManagerIds);

      // Add to existing HOD's managedManagerIds
      if (!existingHod.managedManagerIds) existingHod.managedManagerIds = [];
      if (!existingHod.managedManagerIds.includes(hodId)) {
        existingHod.managedManagerIds.push(hodId);
        console.log('📊 Existing HOD managedManagerIds after push:', existingHod.managedManagerIds);

        await existingHod.save();
        console.log('✅ Added demoted HOD to existing HOD managedManagerIds');
      } else {
        console.log('ℹ️ HOD already in managedManagerIds');
      }

      updateData.managerId = existingHod._id;
      console.log('👤 Assigned demoted HOD to existing HOD');
    } else {
      updateData.managerId = null;
      console.log('❌ No existing HOD found, set managerId to null');
    }

    console.log('\n🎯 Expected Results:');
    console.log('- Old department headId should be cleared');
    console.log('- New department should have hodId in managerIds');
    console.log('- If existing HOD found, hodId should be in their managedManagerIds');
    console.log('- hodId managerId should be set to existing HOD id');

    console.log('\n🎉 Debug test completed! Check backend logs when running actual API call.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  process.exit(0);
}

testHodToManagerDebug();
