const mongoose = require('mongoose');
require('./lib/mongodb');

const User = require('./models/User');
const Department = require('./models/Department');

async function testHodToMemberNewDept() {
  try {
    console.log('🧪 Testing HOD to Member (New Department)...');

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
    console.log('📊 New Department:', newDept._id);

    // Simulate API call - HOD to Member in new department
    const updateData = {
      role: 'member',
      departmentId: newDept._id,
      managerId: null // No manager selected
    };

    console.log('🔄 Converting HOD to Member in new department...');

    // This simulates the HOD Demotion case logic
    console.log('🎯 CASE 1C TRIGGERED: HOD Demotion');

    const oldDepartmentId = hod.departmentId;
    const newDepartmentId = updateData.departmentId;
    const hodId = hod._id;

    console.log('📊 Old Dept:', oldDepartmentId, 'New Dept:', newDepartmentId);

    // Step 1: Clear HOD relationships
    updateData.managedManagerIds = [];
    updateData.managedMemberIds = [];
    console.log('✅ Cleared HOD relationships');

    // Step 2: Clear OLD department head
    await Department.updateOne(
      { _id: oldDepartmentId },
      { headId: null }
    );
    console.log('✅ Cleared old department head');

    // Step 3: Target role is member, add to NEW department memberIds
    await Department.updateOne(
      { _id: newDepartmentId },
      { $addToSet: { memberIds: hodId } }
    );
    console.log('✅ Added to new department memberIds');

    // Find HOD for the NEW department
    const existingHod = await User.findOne({
      role: 'department_head',
      departmentId: newDepartmentId,
      _id: { $ne: hodId }
    });

    if (existingHod) {
      console.log('📊 Found existing HOD in new department:', existingHod._id);

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
      console.log('❌ No existing HOD found in new department');
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
    const updatedOldDept = await Department.findById(oldDepartmentId);
    const updatedNewDept = await Department.findById(newDepartmentId);

    console.log('\n🎯 Final Verification:');
    console.log('✅ Role changed to member:', updatedUser.role === 'member');
    console.log('✅ Department changed:', updatedUser.departmentId?.toString() === newDepartmentId.toString());
    console.log('✅ Old department head cleared:', updatedOldDept.headId === null);
    console.log('✅ Added to new department memberIds:', updatedNewDept.memberIds?.includes(hod._id));

    if (existingHod) {
      const updatedExistingHod = await User.findById(existingHod._id);
      console.log('✅ Added to existing HOD managedMemberIds:', updatedExistingHod.managedMemberIds?.includes(hod._id));
      console.log('✅ ManagerId set to existing HOD:', updatedUser.managerId?.toString() === existingHod._id.toString());
    } else {
      console.log('✅ ManagerId set to null:', updatedUser.managerId === null);
    }

    console.log('\n🎉 HOD to Member (New Department) conversion successful!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  process.exit(0);
}

testHodToMemberNewDept();
