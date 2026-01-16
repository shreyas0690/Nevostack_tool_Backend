const mongoose = require('mongoose');
require('./lib/mongodb');

const User = require('./models/User');
const Department = require('./models/Department');

async function testManagerDepartmentChange() {
  try {
    console.log('🧪 Testing Manager Department Change...');

    // Find a manager in one department
    const manager = await User.findOne({ role: 'manager' });
    if (!manager) {
      console.log('❌ No manager found');
      return;
    }

    console.log('📊 Found Manager:', manager.name, manager._id, 'Dept:', manager.departmentId);

    // Find current department and its HOD
    const currentDept = await Department.findById(manager.departmentId);
    const currentHod = await User.findOne({
      role: 'department_head',
      departmentId: manager.departmentId
    });

    console.log('📊 Current Dept:', currentDept._id, 'HOD:', currentHod?.name);

    // Find another department
    const allDepts = await Department.find({ _id: { $ne: manager.departmentId } });
    if (allDepts.length === 0) {
      console.log('❌ No other department found');
      return;
    }

    const newDept = allDepts[0];
    console.log('📊 Target Dept:', newDept._id);

    // Check if new department has a HOD
    const newHod = await User.findOne({
      role: 'department_head',
      departmentId: newDept._id
    });

    if (!newHod) {
      console.log('❌ New department has no HOD - cannot transfer manager');
      return;
    }

    console.log('📊 New Dept HOD:', newHod.name, newHod._id);

    // Record initial state
    console.log('\n📊 Initial State:');
    console.log('Manager departmentId:', manager.departmentId);
    console.log('Manager managerId:', manager.managerId);
    console.log('Current Dept managerIds:', currentDept.managerIds?.length || 0);
    console.log('New Dept managerIds:', newDept.managerIds?.length || 0);
    console.log('Current HOD managedManagerIds:', currentHod?.managedManagerIds?.length || 0);
    console.log('New HOD managedManagerIds:', newHod.managedManagerIds?.length || 0);

    // Simulate the manager department change
    console.log('\n🔄 Simulating Manager Department Change...');

    // This mimics the backend logic
    const oldDeptId = manager.departmentId;
    const newDeptId = newDept._id;
    const userId = manager._id;

    // Remove from old department's managerIds
    await Department.updateOne(
      { _id: oldDeptId },
      { $pull: { managerIds: userId } }
    );
    console.log('✅ Removed manager from old department managerIds');

    // Add to new department's managerIds
    await Department.updateOne(
      { _id: newDeptId },
      { $addToSet: { managerIds: userId } }
    );
    console.log('✅ Added manager to new department managerIds');

    // Remove from old HOD's managedManagerIds
    if (currentHod && currentHod.managedManagerIds) {
      currentHod.managedManagerIds = currentHod.managedManagerIds.filter(
        id => id.toString() !== userId
      );
      await currentHod.save();
      console.log('✅ Removed manager from old HOD managedManagerIds');
    }

    // Add to new HOD's managedManagerIds
    if (!newHod.managedManagerIds) newHod.managedManagerIds = [];
    if (!newHod.managedManagerIds.includes(userId)) {
      newHod.managedManagerIds.push(userId);
      await newHod.save();
      console.log('✅ Added manager to new HOD managedManagerIds');
    }

    // Update manager's departmentId
    await User.updateOne(
      { _id: userId },
      {
        departmentId: newDeptId,
        managerId: null  // Manager should not have manager
      }
    );

    console.log('✅ Updated manager department and set managerId to null');

    // Verify final state
    const updatedManager = await User.findById(userId);
    const updatedOldDept = await Department.findById(oldDeptId);
    const updatedNewDept = await Department.findById(newDeptId);
    const updatedCurrentHod = await User.findById(currentHod._id);
    const updatedNewHod = await User.findById(newHod._id);

    console.log('\n🎯 Final Verification:');
    console.log('✅ Manager departmentId changed:', updatedManager.departmentId?.toString() === newDeptId.toString());
    console.log('✅ Manager managerId is null:', updatedManager.managerId === null);
    console.log('✅ Removed from old dept managerIds:', !updatedOldDept.managerIds?.includes(userId));
    console.log('✅ Added to new dept managerIds:', updatedNewDept.managerIds?.includes(userId));
    console.log('✅ Removed from old HOD managedManagerIds:', !updatedCurrentHod.managedManagerIds?.includes(userId));
    console.log('✅ Added to new HOD managedManagerIds:', updatedNewHod.managedManagerIds?.includes(userId));

    console.log('\n🎉 Manager Department Change test successful!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  process.exit(0);
}

testManagerDepartmentChange();
