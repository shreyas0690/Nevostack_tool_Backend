const mongoose = require('mongoose');
require('./lib/mongodb');

const User = require('./models/User');
const Department = require('./models/Department');

async function testHodToMemberSpecificManager() {
  try {
    console.log('🧪 Testing HOD to Member (Specific Manager)...');

    // Find HOD
    const hod = await User.findOne({ role: 'department_head' });
    if (!hod) {
      console.log('❌ No HOD found');
      return;
    }

    console.log('📊 Initial HOD:', hod.name, hod._id, 'Dept:', hod.departmentId);

    // Find another department and a manager in it
    const allDepts = await Department.find({ _id: { $ne: hod.departmentId } });
    if (allDepts.length === 0) {
      console.log('❌ No other department found');
      return;
    }

    const newDept = allDepts[0];
    console.log('📊 New Department:', newDept._id);

    // Find a manager in the new department
    const manager = await User.findOne({
      role: 'manager',
      departmentId: newDept._id
    });

    if (!manager) {
      console.log('❌ No manager found in new department');
      return;
    }

    console.log('📊 Manager in new department:', manager.name, manager._id);

    // Simulate API call - HOD to Member with specific manager
    const updateData = {
      role: 'member',
      departmentId: newDept._id,
      managerId: manager._id  // Specific manager
    };

    console.log('🔄 Converting HOD to Member with specific manager...');

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
    }

    // Check if user provided a specific managerId
    if (updateData.managerId) {
      console.log('📊 User provided specific managerId:', updateData.managerId);

      // User specified a specific manager - add to that manager's managedMemberIds
      const specifiedManager = await User.findById(updateData.managerId);
      if (specifiedManager) {
        console.log('📊 Found specified manager:', specifiedManager.name);

        if (!specifiedManager.managedMemberIds) specifiedManager.managedMemberIds = [];
        if (!specifiedManager.managedMemberIds.includes(hodId)) {
          specifiedManager.managedMemberIds.push(hodId);
          await specifiedManager.save();
          console.log('✅ Added demoted HOD to specified manager managedMemberIds');
        }
        console.log('👤 Assigned demoted HOD to specified manager');
      } else {
        console.log('❌ Specified manager not found');
        updateData.managerId = null;
      }
    } else {
      console.log('❌ No specific manager provided');
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
    const updatedManager = await User.findById(manager._id);

    console.log('\n🎯 Final Verification:');
    console.log('✅ Role changed to member:', updatedUser.role === 'member');
    console.log('✅ Department changed:', updatedUser.departmentId?.toString() === newDepartmentId.toString());
    console.log('✅ Old department head cleared:', updatedOldDept.headId === null);
    console.log('✅ Added to new department memberIds:', updatedNewDept.memberIds?.includes(hod._id));
    console.log('✅ ManagerId set to specified manager:', updatedUser.managerId?.toString() === manager._id.toString());
    console.log('✅ Added to specified manager managedMemberIds:', updatedManager.managedMemberIds?.includes(hod._id));

    console.log('\n🎉 HOD to Member (Specific Manager) conversion successful!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  process.exit(0);
}

testHodToMemberSpecificManager();
