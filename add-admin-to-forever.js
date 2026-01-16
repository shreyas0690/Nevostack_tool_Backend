const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Company } = require('./models');

async function addAdminToForever() {
  try {
    await mongoose.connect('mongodb://localhost:27017/nevostack', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('🔍 Adding admin user "jahid" to forever workspace...\n');

    // First, find the forever workspace
    const Workspace = require('./models/Workspace');
    const workspace = await Workspace.findOne({ subdomain: 'forever' });

    if (!workspace) {
      console.log('❌ Workspace "forever" not found');
      await mongoose.disconnect();
      return;
    }

    console.log('✅ Found workspace:');
    console.log(`   📋 Name: ${workspace.name}`);
    console.log(`   🌐 Subdomain: ${workspace.subdomain}`);
    console.log(`   🏢 Company ID: ${workspace.companyId}`);
    console.log('');

    // Check if user "jahid" already exists
    const existingUser = await User.findOne({
      $or: [
        { username: 'jahid' },
        { email: 'jahid@forever.com' },
        { email: 'jahid@nevostack.com' }
      ]
    });

    if (existingUser) {
      console.log('⚠️  User "jahid" already exists:');
      console.log(`   👤 Username: ${existingUser.username}`);
      console.log(`   📧 Email: ${existingUser.email}`);
      console.log(`   🏢 Company ID: ${existingUser.companyId}`);
      console.log('');

      if (existingUser.companyId.toString() === workspace.companyId.toString()) {
        console.log('✅ User is already admin of this workspace');
        console.log('💡 Try logging in with existing credentials');
      } else {
        console.log('❌ User belongs to different company');
        console.log('💡 User needs to be moved or new user created');
      }

      await mongoose.disconnect();
      return;
    }

    // Create new admin user
    console.log('👤 Creating new admin user:');
    console.log('   👤 Username: jahid');
    console.log('   📧 Email: jahid@forever.com');
    console.log('   🔒 Password: Jahid@123');
    console.log('   🔑 Role: admin');
    console.log('');

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash('Jahid@123', saltRounds);

    // Create new user
    const newUser = new User({
      username: 'jahid',
      email: 'jahid@forever.com',
      password: hashedPassword,
      firstName: 'Jahid',
      lastName: 'Admin',
      role: 'admin',
      companyId: workspace.companyId,
      status: 'active',
      security: {
        lastPasswordChange: new Date(),
        twoFactorEnabled: false,
        emailVerified: true,
        phoneVerified: false
      }
    });

    await newUser.save();

    console.log('✅ Admin user created successfully!');
    console.log(`   👤 User ID: ${newUser._id}`);
    console.log(`   📅 Created: ${newUser.createdAt}`);
    console.log('');

    console.log('🎯 Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   🌐 Workspace: forever.nevostack.com`);
    console.log(`   👤 Username: jahid`);
    console.log(`   📧 Email: jahid@forever.com`);
    console.log(`   🔒 Password: Jahid@123`);
    console.log(`   🏷️  Role: admin`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log('\n✅ Setup Complete!');
    console.log('💡 You can now login to forever.nevostack.com with these credentials');

    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
  }
}

addAdminToForever();







