const mongoose = require('mongoose');
require('./lib/mongodb');

const User = require('./models/User');
const Department = require('./models/Department');

async function testHodToMember() {
  try {
    console.log('🧪 Testing HOD to Member conversion (Direct DB)...');

    // Find HOD
    const hod = await User.findOne({ role: 'department_head' });
    if (!hod) {
      console.log('❌ No HOD found');
      return;
    }

    console.log('📊 Found HOD:', hod.name, hod._id, 'Dept:', hod.departmentId);

    // Find department
    const dept = await Department.findById(hod.departmentId);
    console.log('📊 Department headId:', dept?.headId);

    // Check existing HODs in department
    const existingHods = await User.find({
      role: 'department_head',
      departmentId: hod.departmentId,
      _id: { $ne: hod._id }
    });

    console.log('📊 Existing HODs in department:', existingHods.length);

    // Create update data
    const updateData = {
      role: 'member',
      departmentId: hod.departmentId
    };

    // Simulate the logic
    console.log('\n🔄 Simulating HOD Demotion Logic...');

    // Step 1: Clear HOD relationships
    updateData.managedManagerIds = [];
    updateData.managedMemberIds = [];
    console.log('✅ Cleared HOD relationships');

    // Step 2: Clear department head
    await Department.updateOne(
      { _id: hod.departmentId },
      { headId: null }
    );
    console.log('✅ Cleared department head');

    // Step 3: Since target role is member, add to memberIds
    await Department.updateOne(
      { _id: hod.departmentId },
      { $addToSet: { memberIds: hod._id } }
    );
    console.log('✅ Added to department memberIds');

    // Find existing HOD
    const existingHod = await User.findOne({
      role: 'department_head',
      departmentId: hod.departmentId,
      _id: { $ne: hod._id }
    });

    if (existingHod) {
      console.log('📊 Found existing HOD:', existingHod._id);

      // Add to existing HOD's managedMemberIds
      if (!existingHod.managedMemberIds) existingHod.managedMemberIds = [];
      if (!existingHod.managedMemberIds.includes(hod._id)) {
        existingHod.managedMemberIds.push(hod._id);
        await existingHod.save();
        console.log('✅ Added to existing HOD managedMemberIds');
      }

      // Set managerId to existing HOD
      updateData.managerId = existingHod._id;
      console.log('✅ Set managerId to existing HOD');
    } else {
      console.log('❌ No existing HOD found');
      updateData.managerId = null;
      console.log('✅ Set managerId to null');
    }

    // Update the user
    await User.updateOne(
      { _id: hod._id },
      {
        role: updateData.role,
        departmentId: updateData.departmentId,
        managerId: updateData.managerId,
        managedManagerIds: updateData.managedManagerIds,
        managedMemberIds: updateData.managedMemberIds
      }
    );

    console.log('✅ User updated');

    // Verify
    const updatedUser = await User.findById(hod._id);
    const updatedDept = await Department.findById(hod.departmentId);

    console.log('\n🎯 Final Verification:');
    console.log('User role:', updatedUser.role);
    console.log('User departmentId:', updatedUser.departmentId);
    console.log('User managerId:', updatedUser.managerId);
    console.log('Department headId:', updatedDept.headId);
    console.log('Department memberIds includes user:', updatedDept.memberIds?.includes(hod._id));

    if (existingHod) {
      const updatedExistingHod = await User.findById(existingHod._id);
      console.log('Existing HOD managedMemberIds includes user:', updatedExistingHod.managedMemberIds?.includes(hod._id));
    }

    console.log('\n🎉 HOD to Member conversion test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  process.exit(0);
}

testHodToMember();
