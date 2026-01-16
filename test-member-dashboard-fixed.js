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

// Test member data population with CORRECT field names
const testMemberDataFixed = async () => {
  console.log('🎯 TESTING MEMBER DASHBOARD DATA POPULATION (FIXED VERSION)\n');

  try {
    // Check if departments exist
    console.log('📁 Checking Departments:');
    const departments = await Department.find({});
    console.log(`   Found ${departments.length} departments:`);
    departments.forEach(dept => {
      console.log(`   - ${dept.name} (${dept._id}) - Color: ${dept.color}`);
    });

    console.log('\n👥 Checking Users with Department/Manager data (using CORRECT field names):');
    const users = await User.find({})
      .populate('department', 'name color')  // FIXED: was 'departmentId'
      .populate('manager', 'firstName lastName email role')  // FIXED: was 'managerId'
      .select('firstName lastName email role department manager');

    console.log(`   Found ${users.length} total users:`);

    users.forEach((user, index) => {
      console.log(`\n   ${index + 1}. ${user.firstName} ${user.lastName}`);
      console.log(`      Email: ${user.email}`);
      console.log(`      Role: ${user.role}`);
      console.log(`      Department: ${user.department ? user.department.name : 'Not assigned'}`);
      console.log(`      Manager: ${user.manager ? `${user.manager.firstName} ${user.manager.lastName}` : 'Not assigned'}`);
    });

    // Test specific user data (let's pick the first user)
    if (users.length > 0) {
      const testUser = users[0];
      console.log('\n🔍 TESTING DASHBOARD RESPONSE STRUCTURE FOR USER:', testUser.email);

      // Simulate what the FIXED dashboard API would return
      const memberResponse = {
        id: testUser._id,
        name: `${testUser.firstName} ${testUser.lastName}`,
        email: testUser.email,
        role: testUser.role,
        department: testUser.department ? {
          _id: testUser.department._id,
          name: testUser.department.name,
          color: testUser.department.color
        } : null,
        manager: testUser.manager ? {
          _id: testUser.manager._id,
          name: `${testUser.manager.firstName} ${testUser.manager.lastName}`,
          email: testUser.manager.email,
          role: testUser.manager.role
        } : null
      };

      console.log('\n📤 Dashboard Member Response:');
      console.log(JSON.stringify(memberResponse, null, 2));

      if (memberResponse.department) {
        console.log('\n✅ SUCCESS: Department data is populated!');
        console.log(`   Department: ${memberResponse.department.name}`);
        console.log(`   Color: ${memberResponse.department.color}`);
      } else {
        console.log('\n⚠️  WARNING: No department assigned');
      }

      if (memberResponse.manager) {
        console.log('\n✅ SUCCESS: Manager data is populated!');
        console.log(`   Manager: ${memberResponse.manager.name}`);
        console.log(`   Role: ${memberResponse.manager.role}`);
      } else {
        console.log('\n⚠️  WARNING: No manager assigned');
      }
    }

  } catch (error) {
    console.error('❌ Error during data test:', error);
  }
};

// Main function
const main = async () => {
  try {
    await connectDB();
    await testMemberDataFixed();
  } catch (error) {
    console.error('❌ Test execution error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔚 Disconnected from database');
  }
};

main();


















