const mongoose = require('mongoose');
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

// Check user password in database
const checkUserPassword = async () => {
  const testEmail = 'agamon@gmail.com';
  const testPassword = 'Agamon@123';

  console.log('🔍 Checking user password in database...\n');
  console.log(`👤 Email: ${testEmail}`);
  console.log(`🔒 Expected Password: ${testPassword}\n`);

  try {
    // Find user with password field
    const user = await User.findOne({ email: testEmail }).select('+password');

    if (!user) {
      console.log('❌ User not found in database');
      return;
    }

    console.log('✅ User found:');
    console.log(`   - ID: ${user._id}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Username: ${user.username}`);
    console.log(`   - Role: ${user.role}`);
    console.log(`   - Status: ${user.status}`);
    console.log(`   - Has password field: ${!!user.password}`);
    console.log(`   - Password type: ${typeof user.password}`);
    console.log(`   - Password length: ${user.password ? user.password.length : 'N/A'}`);
    console.log(`   - Password value: "${user.password}"`);

    if (user.password) {
      console.log(`   - Starts with $2a$ (bcrypt): ${user.password.startsWith('$2a$')}`);
      console.log(`   - Starts with $2b$ (bcrypt): ${user.password.startsWith('$2b$')}`);
      console.log(`   - Starts with $2y$ (bcrypt): ${user.password.startsWith('$2y$')}`);

      // Check if password is plain text
      const isPlainText = user.password === testPassword;
      console.log(`   - Is plain text password: ${isPlainText}`);

      if (isPlainText) {
        console.log('\n❌ PROBLEM FOUND: Password is stored as plain text!');
        console.log('💡 This means the password was not hashed during registration');
        console.log('🔧 Solution: Need to hash the password properly');
      } else if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$')) {
        console.log('\n✅ Password appears to be properly hashed with bcrypt');

        // Test bcrypt comparison
        const bcrypt = require('bcryptjs');
        const isValid = await bcrypt.compare(testPassword, user.password);
        console.log(`   - Bcrypt comparison result: ${isValid}`);

        if (!isValid) {
          console.log('\n❌ PROBLEM: Password hash doesn\'t match!');
          console.log('💡 Possible issues:');
          console.log('   1. Wrong password used during registration');
          console.log('   2. Password was changed after registration');
          console.log('   3. Character encoding issue');
        }
      } else {
        console.log('\n❌ PROBLEM: Password is not in bcrypt format!');
        console.log(`   - Password format: ${user.password.substring(0, 10)}...`);
      }
    } else {
      console.log('\n❌ PROBLEM: Password field is empty or null!');
    }

    console.log('\n🎯 Summary:');
    if (!user.password) {
      console.log('   ❌ No password found in database');
    } else if (user.password === testPassword) {
      console.log('   ❌ Password is stored as plain text (not hashed)');
    } else if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$')) {
      console.log('   ✅ Password is properly hashed');
    } else {
      console.log('   ❌ Password format is unknown');
    }

  } catch (error) {
    console.error('❌ Error checking user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔚 Disconnected from database');
  }
};

// Run the check
const runCheck = async () => {
  await connectDB();
  await checkUserPassword();
};

runCheck();
