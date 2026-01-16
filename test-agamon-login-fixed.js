const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User } = require('./models');

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

// Test the original user's login
const testAgamonLogin = async () => {
  const testEmail = 'agamon@gmail.com';
  const testPassword = 'Agamon@123';

  console.log('🎯 TESTING ORIGINAL USER LOGIN\n');
  console.log(`📧 Email: ${testEmail}`);
  console.log(`🔒 Password: ${testPassword}\n`);

  try {
    // Find user
    const user = await User.findOne({ email: testEmail }).select('+password');

    if (!user) {
      console.log('❌ User not found');
      return false;
    }

    console.log('✅ User found:');
    console.log(`   Username: ${user.username}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Status: ${user.status}`);
    console.log(`   Has password field: ${!!user.password}`);
    console.log(`   Password hash: ${user.password}`);

    // Test password comparison
    console.log('\n🔐 Testing password comparison...');
    const isPasswordValid = await bcrypt.compare(testPassword, user.password);
    console.log(`   Password comparison result: ${isPasswordValid}`);

    if (isPasswordValid) {
      console.log('\n🎉 SUCCESS! Original user can now login!');
      console.log('✅ Password authentication working correctly');
      console.log('\n📋 Login Credentials:');
      console.log(`   Email: ${testEmail}`);
      console.log(`   Password: ${testPassword}`);
      return true;
    } else {
      console.log('\n❌ FAILED: Password comparison still failing');
      console.log('💡 The password reset may not have worked properly');
      return false;
    }

  } catch (error) {
    console.error('❌ Error during login test:', error);
    return false;
  }
};

// Main function
const main = async () => {
  try {
    await connectDB();
    await testAgamonLogin();
  } catch (error) {
    console.error('❌ Test execution error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔚 Disconnected from database');
  }
};

main();






