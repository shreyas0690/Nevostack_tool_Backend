const mongoose = require('mongoose');
const { User, Department } = require('./models');

// Connect to database
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb+srv://agamonjprince785:Agamon123@cluster0.qjfxyto.mongodb.net/NevoStackTool?retryWrites=true&w=majority&appName=Cluster0";

    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4
    };

    await mongoose.connect(mongoUri, options);
    console.log('✅ Connected to MongoDB Atlas');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Fix member data by assigning departments and managers
const fixMemberData = async () => {
  console.log('🔧 FIXING MEMBER DASHBOARD DATA\n');

  try {
    // Get all departments
    const departments = await Department.find({});
    console.log(`📁 Found ${departments.length} departments`);

    // Get all users
    const users = await User.find({});
    console.log(`👥 Found ${users.length} users`);

    if (departments.length === 0 || users.length === 0) {
      console.log('❌ No departments or users found');
      return;
    }

    // Assign departments and managers
    console.log('\n🔄 Assigning departments and managers...');

    // Get managers and department heads
    const managers = users.filter(u => u.role === 'manager');
    const deptHeads = users.filter(u => u.role === 'department_head');
    const members = users.filter(u => u.role === 'member');

    console.log(`   Managers: ${managers.length}`);
    console.log(`   Department Heads: ${deptHeads.length}`);
    console.log(`   Members: ${members.length}`);

    // Assign colors to departments first
    const departmentColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16'];
    for (let i = 0; i < departments.length; i++) {
      const dept = departments[i];
      if (!dept.color) {
        dept.color = departmentColors[i % departmentColors.length];
        await dept.save();
        console.log(`   ✅ Updated department ${dept.name} with color ${dept.color}`);
      }
    }

    // Assign department to managers and department heads
    let deptIndex = 0;
    for (const manager of [...managers, ...deptHeads]) {
      const dept = departments[deptIndex % departments.length];
      manager.departmentId = dept._id.toString();
      await manager.save();
      console.log(`   ✅ Assigned ${manager.firstName} ${manager.lastName} to department ${dept.name}`);
      deptIndex++;
    }

    // Assign department and manager to members
    let memberIndex = 0;
    for (const member of members) {
      const dept = departments[memberIndex % departments.length];
      const availableManagers = [...managers, ...deptHeads].filter(m =>
        m.departmentId === dept._id.toString() || m.departmentId === dept._id
      );

      member.departmentId = dept._id.toString();

      if (availableManagers.length > 0) {
        const manager = availableManagers[memberIndex % availableManagers.length];
        member.managerId = manager._id.toString();
        console.log(`   ✅ Assigned ${member.firstName} ${member.lastName} to department ${dept.name} with manager ${manager.firstName} ${manager.lastName}`);
      } else {
        console.log(`   ⚠️  Assigned ${member.firstName} ${member.lastName} to department ${dept.name} (no manager available)`);
      }

      await member.save();
      memberIndex++;
    }

    console.log('\n🎉 SUCCESS: Member data has been fixed!');
    console.log('\n📊 Updated Data Summary:');

    // Verify the changes
    const updatedUsers = await User.find({})
      .populate('departmentId', 'name color')
      .populate('managerId', 'firstName lastName email role')
      .select('firstName lastName email role departmentId managerId');

    console.log('\n👥 Final User Assignments:');
    updatedUsers.forEach((user, index) => {
      console.log(`\n   ${index + 1}. ${user.firstName} ${user.lastName} (${user.role})`);
      console.log(`      Department: ${user.departmentId ? user.departmentId.name : 'Not assigned'}`);
      console.log(`      Manager: ${user.managerId ? `${user.managerId.firstName} ${user.managerId.lastName}` : 'Not assigned'}`);
    });

  } catch (error) {
    console.error('❌ Error fixing member data:', error);
  }
};

// Main function
const main = async () => {
  try {
    await connectDB();
    await fixMemberData();
  } catch (error) {
    console.error('❌ Execution error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔚 Disconnected from database');
  }
};

main();









