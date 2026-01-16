const mongoose = require('mongoose');
require('./lib/mongodb');

const User = require('./models/User');
const Department = require('./models/Department');

async function testHodToMember() {
  try {
    console.log('🧪 Testing HOD to Member conversion...');

    // Find HOD
    const hod = await User.findOne({ role: 'department_head' });
    if (!hod) {
      console.log('❌ No HOD found');
      return;
    }

    console.log('📊 Initial HOD:', hod.name, hod._id, 'Role:', hod.role);

    // Find department
    const dept = await Department.findById(hod.departmentId);
    console.log('📊 Initial Department headId:', dept?.headId);

    // Simulate API call - HOD to Member
    const updateData = {
      role: 'member',
      departmentId: hod.departmentId
    };

    console.log('🔄 Converting HOD to Member...');

    // This simulates the HOD Demotion case logic
    console.log('🎯 CASE 1C TRIGGERED: HOD Demotion');

    const departmentId = hod.departmentId;
    const hodId = hod._id;

    // Step 1: Clear HOD relationships
    updateData.managedManagerIds = [];
    updateData.managedMemberIds = [];
    console.log('✅ Cleared HOD relationships');

    // Step 2: Clear department head
    await Department.updateOne(
      { _id: departmentId },
      { headId: null }
    );
    console.log('✅ Cleared department head');

    // Step 3: Target role is member, add to memberIds
    await Department.updateOne(
      { _id: departmentId },
      { $addToSet: { memberIds: hodId } }
    );
    console.log('✅ Added to department memberIds');

    // Find existing HOD
    const existingHod = await User.findOne({
      role: 'department_head',
      departmentId: departmentId,
      _id: { $ne: hodId }
    });

    if (existingHod) {
      console.log('📊 Found existing HOD:', existingHod._id);

      // Add to existing HOD's managedMemberIds
      if (!existingHod.managedMemberIds) existingHod.managedMemberIds = [];
      if (!existingHod.managedMemberIds.includes(hodId)) {
        existingHod.managedMemberIds.push(hodId);
        await existingHod.save();
        console.log('✅ Added to existing HOD managedMemberIds');
      }

      updateData.managerId = existingHod._id;
      console.log('✅ Set managerId to existing HOD');
    } else {
      console.log('❌ No existing HOD found');
      updateData.managerId = null;
      console.log('✅ Set managerId to null');
    }

    // Update the user
    await User.updateOne(
      { _id: hodId },
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
    console.log('✅ Role changed to member:', updatedUser.role === 'member');
    console.log('✅ Department head cleared:', updatedDept.headId === null);
    console.log('✅ Added to memberIds:', updatedDept.memberIds?.includes(hod._id));
    console.log('✅ Managed relationships cleared:', updatedUser.managedManagerIds.length === 0 && updatedUser.managedMemberIds.length === 0);

    if (existingHod) {
      const updatedExistingHod = await User.findById(existingHod._id);
      console.log('✅ Added to existing HOD managedMemberIds:', updatedExistingHod.managedMemberIds?.includes(hod._id));
      console.log('✅ ManagerId set to existing HOD:', updatedUser.managerId?.toString() === existingHod._id.toString());
    } else {
      console.log('✅ ManagerId set to null:', updatedUser.managerId === null);
    }

    console.log('\n🎉 HOD to Member conversion successful!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  process.exit(0);
}

testHodToMember();
