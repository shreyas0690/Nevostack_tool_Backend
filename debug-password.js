const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User } = require('./models');

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/nevostack');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Debug password comparison
const debugPassword = async () => {
  const testEmail = 'agamon@gmail.com';
  const testPassword = 'Agamon@123';

  console.log('🔍 Debugging password comparison...\n');
  console.log(`👤 Email: ${testEmail}`);
  console.log(`🔒 Password: ${testPassword}\n`);

  try {
    // Find user with password field
    console.log('📊 Step 1: Finding user in database...');
    const user = await User.findOne({ email: testEmail }).select('+password');

    if (!user) {
      console.log('❌ User not found in database');
      return;
    }

    console.log('✅ User found:');
    console.log(`   - ID: ${user._id}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Username: ${user.username}`);
    console.log(`   - Has Password Field: ${!!user.password}`);
    console.log(`   - Password Length: ${user.password ? user.password.length : 'N/A'}`);
    console.log(`   - Password Preview: ${user.password ? user.password.substring(0, 20) + '...' : 'N/A'}\n`);

    // Test password comparison
    console.log('📊 Step 2: Testing password comparison...');
    console.log(`   - Input Password: "${testPassword}"`);
    console.log(`   - Stored Hash: "${user.password}"\n`);

    const isValid = await bcrypt.compare(testPassword, user.password);
    console.log(`🔍 Comparison Result: ${isValid}\n`);

    // Additional debugging
    console.log('📊 Step 3: Additional checks...');
    console.log(`   - Password is string: ${typeof user.password === 'string'}`);
    console.log(`   - Password starts with $2a$: ${user.password ? user.password.startsWith('$2a$') : 'N/A'}`);
    console.log(`   - Password length: ${user.password ? user.password.length : 'N/A'}`);

    // Try with different variations
    const variations = [
      testPassword,
      testPassword.toLowerCase(),
      testPassword.toUpperCase(),
      testPassword.substring(0, testPassword.length - 1) // Remove last char
    ];

    console.log('\n📊 Step 4: Testing variations...');
    for (const variation of variations) {
      const result = await bcrypt.compare(variation, user.password);
      console.log(`   - "${variation}": ${result}`);
    }

    // Check if password was hashed correctly
    console.log('\n📊 Step 5: Checking hash validity...');
    const saltRounds = 12;
    const newHash = await bcrypt.hash(testPassword, saltRounds);
    console.log(`   - New hash for "${testPassword}": ${newHash.substring(0, 20)}...`);

    const compareWithNew = await bcrypt.compare(testPassword, newHash);
    console.log(`   - New hash comparison: ${compareWithNew}`);

    console.log('\n🎯 Summary:');
    console.log(`   - User exists: ✅`);
    console.log(`   - Password field exists: ${user.password ? '✅' : '❌'}`);
    console.log(`   - Password comparison: ${isValid ? '✅ WORKS' : '❌ FAILS'}`);

    if (!isValid) {
      console.log('\n💡 Possible Issues:');
      console.log('   1. Password was not hashed properly during registration');
      console.log('   2. Password was changed after registration');
      console.log('   3. There\'s a character encoding issue');
      console.log('   4. The stored password is corrupted');
    }

  } catch (error) {
    console.error('❌ Error during debugging:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔚 Disconnected from database');
  }
};

// Run the debug function
const runDebug = async () => {
  await connectDB();
  await debugPassword();
};

runDebug();






