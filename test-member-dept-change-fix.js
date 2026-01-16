const mongoose = require('mongoose');
require('./lib/mongodb');

const User = require('./models/User');
const Department = require('./models/Department');

async function testMemberDepartmentChangeFix() {
  try {
    console.log('🧪 Testing Member Department Change Fix...');

    // Find a member in one department
    const member = await User.findOne({ role: 'member' });
    if (!member) {
      console.log('❌ No member found');
      return;
    }

    console.log('📊 Found Member:', member.name, member._id, 'Dept:', member.departmentId);

    // Find current department and its HOD
    const currentDept = await Department.findById(member.departmentId);
    const currentHod = await User.findOne({
      role: 'department_head',
      departmentId: member.departmentId
    });

    console.log('📊 Current Dept memberIds:', currentDept?.memberIds?.length || 0);
    console.log('📊 Current HOD:', currentHod?.name);

    // Find another department
    const allDepts = await Department.find({ _id: { $ne: member.departmentId } });
    if (allDepts.length === 0) {
      console.log('❌ No other department found');
      return;
    }

    const newDept = allDepts[0];
    console.log('📊 New Dept:', newDept._id, 'memberIds:', newDept.memberIds?.length || 0);

    // Check if new department has a HOD
    const newHod = await User.findOne({
      role: 'department_head',
      departmentId: newDept._id
    });

    if (!newHod) {
      console.log('❌ New department has no HOD - cannot transfer member');
      return;
    }

    console.log('📊 New Dept HOD:', newHod.name);

    // Record initial state
    console.log('\n📊 Initial State:');
    console.log('Member departmentId:', member.departmentId);
    console.log('Member managerId:', member.managerId);
    console.log('Current Dept memberIds includes member:', currentDept.memberIds?.includes(member._id));
    console.log('New Dept memberIds includes member:', newDept.memberIds?.includes(member._id));
    console.log('Current HOD managedMemberIds includes member:', currentHod?.managedMemberIds?.includes(member._id));
    console.log('New HOD managedMemberIds includes member:', newHod.managedMemberIds?.includes(member._id));

    // Simulate the member department change
    console.log('\n🔄 Simulating Member Department Change...');

    // This mimics the fixed backend logic
    const oldDeptId = member.departmentId;
    const newDeptId = newDept._id;
    const userId = member._id;

    // Find old and new HODs
    const oldHod = currentHod;
    const newHodForLogic = newHod;

    // STEP 1: CLEANUP - Remove from OLD department relationships

    // 1a. Remove from OLD department's memberIds
    await Department.updateOne(
      { _id: oldDeptId },
      { $pull: { memberIds: userId } }
    );
    console.log('✅ Removed member from old department memberIds');

    // 1b. Remove from old HOD's managedMemberIds
    if (oldHod && oldHod.managedMemberIds) {
      oldHod.managedMemberIds = oldHod.managedMemberIds.filter(
        id => id.toString() !== userId
      );
      await oldHod.save();
      console.log('✅ Removed member from old HOD managedMemberIds');
    }

    // 1c. Remove from previous manager's managedMemberIds (if had a manager)
    if (member.managerId) {
      const prevManager = await User.findById(member.managerId);
      if (prevManager && prevManager.managedMemberIds) {
        prevManager.managedMemberIds = prevManager.managedMemberIds.filter(
          id => id.toString() !== userId
        );
        await prevManager.save();
        console.log('✅ Removed member from old manager managedMemberIds');
      }
    }

    // STEP 2: SETUP - Add to NEW department relationships

    // 2a. Add to NEW department's memberIds
    await Department.updateOne(
      { _id: newDeptId },
      { $addToSet: { memberIds: userId } }
    );
    console.log('✅ Added member to new department memberIds');

    // 2b. Add to new HOD's managedMemberIds
    if (!newHodForLogic.managedMemberIds) newHodForLogic.managedMemberIds = [];
    if (!newHodForLogic.managedMemberIds.includes(userId)) {
      newHodForLogic.managedMemberIds.push(userId);
      await newHodForLogic.save();
      console.log('✅ Added member to new HOD managedMemberIds');
    }

    // Update member's departmentId
    await User.updateOne(
      { _id: userId },
      { departmentId: newDeptId }
    );

    console.log('✅ Updated member departmentId');

    // Verify final state
    const updatedMember = await User.findById(userId);
    const updatedOldDept = await Department.findById(oldDeptId);
    const updatedNewDept = await Department.findById(newDeptId);
    const updatedCurrentHod = currentHod ? await User.findById(currentHod._id) : null;
    const updatedNewHod = await User.findById(newHod._id);

    console.log('\n🎯 Final Verification:');
    console.log('✅ Member departmentId changed:', updatedMember.departmentId?.toString() === newDeptId.toString());
    console.log('✅ Removed from old dept memberIds:', !updatedOldDept.memberIds?.includes(userId));
    console.log('✅ Added to new dept memberIds:', updatedNewDept.memberIds?.includes(userId));

    if (updatedCurrentHod) {
      console.log('✅ Removed from old HOD managedMemberIds:', !updatedCurrentHod.managedMemberIds?.includes(userId));
    }

    console.log('✅ Added to new HOD managedMemberIds:', updatedNewHod.managedMemberIds?.includes(userId));

    const success = updatedMember.departmentId?.toString() === newDeptId.toString() &&
                   !updatedOldDept.memberIds?.includes(userId) &&
                   updatedNewDept.memberIds?.includes(userId) &&
                   updatedNewHod.managedMemberIds?.includes(userId);

    if (success) {
      console.log('\n🎉 Member Department Change test successful!');
    } else {
      console.log('\n❌ Member Department Change test failed!');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  process.exit(0);
}

testMemberDepartmentChangeFix();
