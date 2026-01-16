const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Company, Workspace } = require('./models');

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

// Generate unique test data
const generateTestData = () => {
  const timestamp = Date.now();
  return {
    email: `test${timestamp}@example.com`,
    password: 'TestPass123!',
    username: `testuser${timestamp}`,
    companyName: `Test Company ${timestamp}`,
    domain: `test${timestamp}.nevostack.com`
  };
};

// Simulate complete registration process
const simulateRegistration = async () => {
  const testData = generateTestData();

  console.log('🚀 STARTING REGISTRATION SIMULATION\n');
  console.log('📋 Test Data:');
  console.log(`   Email: ${testData.email}`);
  console.log(`   Password: ${testData.password}`);
  console.log(`   Username: ${testData.username}`);
  console.log(`   Company: ${testData.companyName}`);
  console.log(`   Domain: ${testData.domain}\n`);

  try {
    // Step 1: Check if email/username already exists
    console.log('📊 Step 1: Checking for existing users...');
    const existingUser = await User.findOne({
      $or: [{ email: testData.email }, { username: testData.username }]
    });

    if (existingUser) {
      console.log('❌ User already exists, skipping registration');
      return null;
    }
    console.log('✅ No existing user found\n');

    // Step 2: Check if domain already exists
    console.log('📊 Step 2: Checking domain availability...');
    const existingCompany = await Company.findOne({ domain: testData.domain });
    if (existingCompany) {
      console.log('❌ Domain already exists, skipping registration');
      return null;
    }
    console.log('✅ Domain is available\n');

    // Step 3: Hash password
    console.log('📊 Step 3: Hashing password...');
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(testData.password, saltRounds);
    console.log(`   Original: "${testData.password}"`);
    console.log(`   Hashed: "${hashedPassword}"`);
    console.log(`   Hash length: ${hashedPassword.length} characters`);
    console.log(`   Valid bcrypt format: ${hashedPassword.startsWith('$2a$') || hashedPassword.startsWith('$2b$') || hashedPassword.startsWith('$2y$')}\n`);

    // Step 4: Create company
    console.log('📊 Step 4: Creating company...');
    const company = new Company({
      name: testData.companyName,
      domain: testData.domain,
      email: testData.email,
      status: 'active',
      subscription: {
        plan: 'basic',
        status: 'active',
        startDate: new Date(),
        features: []
      },
      settings: {
        theme: 'default',
        timezone: 'UTC',
        language: 'en',
        notifications: {
          email: true,
          push: true,
          sms: false
        }
      }
    });

    await company.save();
    console.log(`✅ Company created: ${company._id}\n`);

    // Step 5: Create user
    console.log('📊 Step 5: Creating admin user...');
    const adminUser = new User({
      username: testData.username,
      email: testData.email,
      password: hashedPassword,
      firstName: testData.username,
      lastName: 'User',
      role: 'admin',
      companyId: company._id,
      status: 'active',
      security: {
        lastPasswordChange: new Date(),
        twoFactorEnabled: false,
        emailVerified: false,
        phoneVerified: false
      },
      securitySettings: {
        maxActiveDevices: 5,
        sessionTimeout: 30,
        requireStrongPassword: true
      }
    });

    await adminUser.save();
    console.log(`✅ Admin user created: ${adminUser._id}`);
    console.log(`   Username: ${adminUser.username}`);
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Role: ${adminUser.role}\n`);

    // Step 6: Create workspace
    console.log('📊 Step 6: Creating workspace...');
    const subdomain = testData.domain.split('.')[0];
    const workspace = new Workspace({
      name: `${testData.companyName} Workspace`,
      subdomain: subdomain,
      domain: testData.domain,
      companyId: company._id,
      ownerId: adminUser._id,
      status: 'active',
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days trial
      billing: {
        interval: 'monthly',
        status: 'trial'
      },
      limits: {
        maxUsers: 10,
        maxProjects: 5,
        storageLimit: 1000 // MB
      },
      usage: {
        currentUsers: 1,
        currentProjects: 0,
        storageUsed: 0
      }
    });

    await workspace.save();
    console.log(`✅ Workspace created: ${workspace._id}`);
    console.log(`   Name: ${workspace.name}`);
    console.log(`   Subdomain: ${workspace.subdomain}\n`);

    // Step 7: Verify registration
    console.log('📊 Step 7: Verifying registration...');
    const verifyUser = await User.findOne({ email: testData.email }).select('+password');
    if (verifyUser) {
      console.log('✅ User verification successful');
      console.log(`   Stored password hash: ${verifyUser.password}`);
      console.log(`   Password verification test: ${await bcrypt.compare(testData.password, verifyUser.password)}\n`);
    }

    console.log('🎉 REGISTRATION COMPLETED SUCCESSFULLY!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Email: ${testData.email}`);
    console.log(`   Password: ${testData.password}`);
    console.log(`   Username: ${testData.username}`);
    console.log(`   Company: ${testData.companyName}`);
    console.log(`   Workspace: ${subdomain}.nevostack.com`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return {
      email: testData.email,
      password: testData.password,
      username: testData.username,
      companyName: testData.companyName,
      subdomain: subdomain,
      hashedPassword: hashedPassword
    };

  } catch (error) {
    console.error('❌ Registration failed:', error);
    return null;
  }
};

// Test login after registration
const testLoginAfterRegistration = async (userData) => {
  console.log('🔐 TESTING LOGIN AFTER REGISTRATION\n');
  console.log('📋 Login Credentials:');
  console.log(`   Email: ${userData.email}`);
  console.log(`   Password: ${userData.password}\n`);

  try {
    // Step 1: Find user
    console.log('📊 Step 1: Finding user in database...');
    const user = await User.findOne({ email: userData.email }).select('+password');

    if (!user) {
      console.log('❌ User not found!');
      return false;
    }

    console.log('✅ User found:');
    console.log(`   ID: ${user._id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Has password field: ${!!user.password}`);
    console.log(`   Password hash length: ${user.password ? user.password.length : 'N/A'}`);

    // Step 2: Test password comparison
    console.log('\n📊 Step 2: Testing password comparison...');
    console.log(`   Input password: "${userData.password}"`);
    console.log(`   Stored hash: "${user.password}"`);

    const isPasswordValid = await bcrypt.compare(userData.password, user.password);
    console.log(`   Password comparison result: ${isPasswordValid}`);

    if (isPasswordValid) {
      console.log('\n✅ LOGIN TEST SUCCESSFUL!');
      console.log('   Password hashing and comparison working correctly');
      return true;
    } else {
      console.log('\n❌ LOGIN TEST FAILED!');
      console.log('   Password comparison failed');

      // Additional debugging
      console.log('\n🔍 Additional Analysis:');
      console.log(`   Original hash from registration: "${userData.hashedPassword}"`);
      console.log(`   Stored hash in database: "${user.password}"`);
      console.log(`   Hashes match: ${userData.hashedPassword === user.password}`);

      return false;
    }

  } catch (error) {
    console.error('❌ Login test error:', error);
    return false;
  }
};

// Main function
const main = async () => {
  try {
    await connectDB();

    // Step 1: Register new user
    console.log('🚀 STEP 1: REGISTERING NEW USER\n');
    const userData = await simulateRegistration();

    if (!userData) {
      console.log('❌ Registration failed, cannot proceed with login test');
      return;
    }

    // Step 2: Test login
    console.log('🚀 STEP 2: TESTING LOGIN\n');
    const loginSuccess = await testLoginAfterRegistration(userData);

    // Step 3: Summary
    console.log('\n🎯 FINAL SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (loginSuccess) {
      console.log('✅ SUCCESS: Complete registration and login flow working!');
      console.log('   - Password hashing: ✅ Working');
      console.log('   - Password storage: ✅ Working');
      console.log('   - Password comparison: ✅ Working');
      console.log('   - Login process: ✅ Working');
    } else {
      console.log('❌ FAILURE: Issue detected in registration/login flow');
      console.log('   - Password hashing: ❓ Needs investigation');
      console.log('   - Password storage: ❓ Needs investigation');
      console.log('   - Password comparison: ❌ Failed');
      console.log('   - Login process: ❌ Failed');
    }

    console.log('\n📋 Test User Details:');
    console.log(`   Email: ${userData.email}`);
    console.log(`   Password: ${userData.password}`);
    console.log(`   Username: ${userData.username}`);
    console.log(`   You can use these credentials to test login manually`);

  } catch (error) {
    console.error('❌ Test execution error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔚 Disconnected from database');
  }
};

main();






