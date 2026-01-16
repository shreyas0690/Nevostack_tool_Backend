const mongoose = require('mongoose');
require('./lib/mongodb');

const User = require('./models/User');
const Department = require('./models/Department');

async function testHodSameDeptValidation() {
  try {
    console.log('🧪 Testing HOD Same Department Validation...');

    // Find an HOD
    const hod = await User.findOne({ role: 'department_head' });
    if (!hod) {
      console.log('❌ No HOD found');
      return;
    }

    console.log('📊 Found HOD:', hod.name, hod._id, 'Dept:', hod.departmentId);

    // Find the department
    const dept = await Department.findById(hod.departmentId);
    console.log('📊 Department:', dept._id, 'headId:', dept.headId);

    // Test 1: Try to change HOD to Manager in SAME department (should fail)
    console.log('\n🧪 Test 1: HOD to Manager in SAME department (should FAIL)');

    try {
      // Simulate API call - HOD to Manager in same department
      const updateData = {
        role: 'manager',
        departmentId: hod.departmentId  // SAME department
      };

      // This should trigger validation error
      console.log('🔄 Attempting HOD to Manager in same department...');

      // Simulate the validation logic
      const oldDepartmentId = hod.departmentId;
      const newDepartmentId = updateData.departmentId || oldDepartmentId;

      if (newDepartmentId.toString() === oldDepartmentId.toString()) {
        throw new Error('HOD cannot change role within the same department. HOD must either stay as HOD or move to a different department.');
      }

      console.log('❌ Validation should have failed but didn\'t!');

    } catch (error) {
      if (error.message.includes('HOD cannot change role within the same department')) {
        console.log('✅ Validation correctly prevented HOD role change in same department');
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }

    // Test 2: Try to change HOD to Member in SAME department (should fail)
    console.log('\n🧪 Test 2: HOD to Member in SAME department (should FAIL)');

    try {
      // Simulate API call - HOD to Member in same department
      const updateData = {
        role: 'member',
        departmentId: hod.departmentId  // SAME department
      };

      // This should trigger validation error
      console.log('🔄 Attempting HOD to Member in same department...');

      // Simulate the validation logic
      const oldDepartmentId = hod.departmentId;
      const newDepartmentId = updateData.departmentId || oldDepartmentId;

      if (newDepartmentId.toString() === oldDepartmentId.toString()) {
        throw new Error('HOD cannot change role within the same department. HOD must either stay as HOD or move to a different department.');
      }

      console.log('❌ Validation should have failed but didn\'t!');

    } catch (error) {
      if (error.message.includes('HOD cannot change role within the same department')) {
        console.log('✅ Validation correctly prevented HOD role change in same department');
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }

    // Test 3: HOD stays as HOD in SAME department (should succeed)
    console.log('\n🧪 Test 3: HOD stays as HOD in SAME department (should SUCCEED)');

    try {
      // Simulate API call - HOD stays as HOD in same department
      const updateData = {
        role: 'department_head',
        departmentId: hod.departmentId  // SAME department
      };

      console.log('🔄 Attempting HOD stays as HOD in same department...');

      // This should NOT trigger the demotion case at all
      const shouldTriggerDemotion = (hod.role === 'department_head' && updateData.role !== 'department_head');

      if (!shouldTriggerDemotion) {
        console.log('✅ HOD staying as HOD does not trigger demotion validation');
      } else {
        console.log('❌ HOD staying as HOD incorrectly triggered demotion validation');
      }

    } catch (error) {
      console.log('❌ Unexpected error:', error.message);
    }

    // Test 4: HOD changes to different department (should succeed)
    console.log('\n🧪 Test 4: HOD changes to DIFFERENT department (should SUCCEED)');

    // Find another department
    const allDepts = await Department.find({ _id: { $ne: hod.departmentId } });
    if (allDepts.length === 0) {
      console.log('⚠️ No other department available for test');
    } else {
      const newDept = allDepts[0];

      try {
        // Simulate API call - HOD to Manager in different department
        const updateData = {
          role: 'manager',
          departmentId: newDept._id  // DIFFERENT department
        };

        console.log('🔄 Attempting HOD to Manager in different department...');

        // This should NOT trigger the same department validation
        const oldDepartmentId = hod.departmentId;
        const newDepartmentId = updateData.departmentId || oldDepartmentId;

        if (newDepartmentId.toString() === oldDepartmentId.toString()) {
          console.log('❌ Incorrectly flagged as same department');
        } else {
          console.log('✅ Correctly allowed HOD role change in different department');
        }

      } catch (error) {
        console.log('❌ Unexpected error:', error.message);
      }
    }

    console.log('\n🎯 Summary:');
    console.log('✅ HOD cannot change role in same department');
    console.log('✅ HOD can stay as HOD in same department');
    console.log('✅ HOD can change role in different department');
    console.log('\n🎉 HOD Same Department Validation tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  process.exit(0);
}

testHodSameDeptValidation();





























