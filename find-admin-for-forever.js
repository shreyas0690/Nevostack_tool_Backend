const mongoose = require('mongoose');
const { User, Company } = require('./models');

async function findAdminForForever() {
  try {
    await mongoose.connect('mongodb://localhost:27017/nevostack', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('🔍 Finding admin user for workspace "forever.nevostack.com"...\n');

    // First, find the workspace
    const Workspace = require('./models/Workspace');
    const workspace = await Workspace.findOne({ subdomain: 'forever' });

    if (!workspace) {
      console.log('❌ Workspace "forever" not found');
      await mongoose.disconnect();
      return;
    }

    console.log('🏢 Workspace Found:');
    console.log(`   📋 Name: ${workspace.name}`);
    console.log(`   🌐 Subdomain: ${workspace.subdomain}`);
    console.log(`   🏢 Domain: ${workspace.domain}`);
    console.log(`   👤 Owner ID: ${workspace.ownerId}`);
    console.log(`   🏢 Company ID: ${workspace.companyId}`);
    console.log('');

    // Now find the admin user
    console.log('👤 Finding Admin User:');
    const adminUser = await User.findById(workspace.ownerId).select('-password');

    if (!adminUser) {
      console.log('❌ Admin user not found in database');
      console.log('💡 This might indicate data corruption');
      await mongoose.disconnect();
      return;
    }

    console.log('✅ Admin User Found:');
    console.log(`   👤 Username: ${adminUser.username}`);
    console.log(`   📧 Email: ${adminUser.email}`);
    console.log(`   👨 Name: ${adminUser.firstName} ${adminUser.lastName || ''}`.trim());
    console.log(`   🏢 Company ID: ${adminUser.companyId}`);
    console.log(`   🔒 Role: ${adminUser.role}`);
    console.log(`   📊 Status: ${adminUser.status}`);
    console.log(`   📅 Created: ${adminUser.createdAt}`);
    console.log('');

    // Verify the user belongs to the correct company
    if (adminUser.companyId && workspace.companyId) {
      if (adminUser.companyId.toString() === workspace.companyId.toString()) {
        console.log('✅ Admin user is correctly linked to the workspace');
      } else {
        console.log('⚠️  Admin user company ID does not match workspace company ID');
      }
    }

    // Check if there are other admin users for this company
    console.log('\n👥 Checking for other admin users in this company:');
    const otherAdmins = await User.find({
      companyId: workspace.companyId,
      role: 'admin',
      _id: { $ne: workspace.ownerId }
    }).select('username email firstName lastName role status');

    if (otherAdmins.length > 0) {
      console.log('📋 Other Admin Users:');
      otherAdmins.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.username} (${user.email}) - ${user.status}`);
      });
    } else {
      console.log('   No other admin users found');
    }

    console.log('\n🎯 Login Credentials for Workspace:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   🌐 Workspace: forever.nevostack.com`);
    console.log(`   👤 Username: ${adminUser.username}`);
    console.log(`   📧 Email: ${adminUser.email}`);
    console.log(`   🔒 Password: [Check with user who created this workspace]`);
    console.log(`   🏷️  Role: ${adminUser.role}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log('\n💡 Note: Password is hashed in database. If you forgot the password,');
    console.log('   you would need to reset it or create a new admin user.');

    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
  }
}

findAdminForForever();







