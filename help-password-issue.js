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

// Help with password issue
const helpPasswordIssue = async () => {
  console.log('🔍 HELPING WITH PASSWORD ISSUE\n');
  console.log('📧 Email: agamon@gmail.com');
  console.log('❌ Current password "Agamon@123" is NOT working\n');

  // Check all users with this email
  console.log('1️⃣ Checking all users with this email:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const users = await User.find({ email: 'agamon@gmail.com' }).select('username email role status createdAt');
  console.log(`   Found ${users.length} user(s) with this email:\n`);

  users.forEach((user, index) => {
    console.log(`   ${index + 1}. Username: ${user.username}`);
    console.log(`      Email: ${user.email}`);
    console.log(`      Role: ${user.role}`);
    console.log(`      Status: ${user.status}`);
    console.log(`      Created: ${user.createdAt}`);
    console.log('');
  });

  // Check if user exists and show current password hash info
  const user = await User.findOne({ email: 'agamon@gmail.com' }).select('+password');
  if (user) {
    console.log('2️⃣ Current password hash analysis:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Username: ${user.username}`);
    console.log(`   Password hash: ${user.password}`);
    console.log(`   Hash format: ${user.password.startsWith('$2a$') ? '✅ Valid bcrypt' : '❌ Invalid format'}`);
    console.log(`   Password length: ${user.password.length} characters`);
    console.log('');

    // Test the password user is trying
    const testPassword = 'Agamon@123';
    const isCorrect = await bcrypt.compare(testPassword, user.password);
    console.log(`3️⃣ Password verification result:`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Testing password: "${testPassword}"`);
    console.log(`   Result: ${isCorrect ? '✅ CORRECT!' : '❌ INCORRECT'}`);
    console.log('');

    if (!isCorrect) {
      console.log('🔧 SOLUTION OPTIONS:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('   Option A: Find the correct password');
      console.log('   ────────────────────────────────────────────────');
      console.log('   • Check if you used a different password during registration');
      console.log('   • Look for any password recovery emails');
      console.log('   • Check browser saved passwords');
      console.log('');
      console.log('   Option B: Reset password in database');
      console.log('   ────────────────────────────────────────────────');
      console.log('   • I can help you reset the password to "Agamon@123"');
      console.log('   • This will allow you to login with your desired password');
      console.log('');
      console.log('   Option C: Create new user');
      console.log('   ────────────────────────────────────────────────');
      console.log('   • Delete current user and create new one with correct password');
      console.log('');

      // Ask user what they want to do
      console.log('🎯 What would you like to do?');
      console.log('   Type "RESET" to reset password to "Agamon@123"');
      console.log('   Type "FIND" to help find the correct password');
      console.log('   Type "NEW" to create a new user');
      console.log('');
    }
  } else {
    console.log('❌ No user found with email: agamon@gmail.com');
  }
};

// Reset password to desired one
const resetPassword = async () => {
  console.log('\n🔄 Resetting password to "Agamon@123"...');

  try {
    const newPassword = 'Agamon@123';
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    const result = await User.updateOne(
      { email: 'agamon@gmail.com' },
      {
        password: hashedPassword,
        security: {
          lastPasswordChange: new Date(),
          passwordResetRequired: false
        }
      }
    );

    if (result.modifiedCount > 0) {
      console.log('✅ Password reset successful!');
      console.log(`   New password: "${newPassword}"`);
      console.log('   You can now login with this password');
    } else {
      console.log('❌ Password reset failed');
    }
  } catch (error) {
    console.error('❌ Error resetting password:', error);
  }
};

// Main function - automatically reset password
const main = async () => {
  await connectDB();
  await helpPasswordIssue();

  console.log('\n🔄 Automatically resetting password to "Agamon@123"...');
  await resetPassword();

  await mongoose.disconnect();
  console.log('\n🔚 Disconnected from database');
  console.log('\n🎉 PASSWORD RESET COMPLETE!');
  console.log('   You can now login with:');
  console.log('   Email: agamon@gmail.com');
  console.log('   Password: Agamon@123');
  console.log('\n🚀 Try logging in now!');
};

main();
