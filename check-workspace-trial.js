const mongoose = require('mongoose');
const Workspace = require('./models/Workspace');

async function checkWorkspaceTrial() {
  try {
    await mongoose.connect('mongodb://localhost:27017/nevostack', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('🔍 Checking workspace trial data...\n');

    const workspaces = await Workspace.find({}).limit(5).sort({ createdAt: -1 });

    workspaces.forEach((workspace, index) => {
      console.log(`📋 Workspace ${index + 1}:`);
      console.log(`   Name: ${workspace.name}`);
      console.log(`   Subdomain: ${workspace.subdomain}`);
      console.log(`   Status: ${workspace.status}`);
      console.log(`   Plan: ${workspace.plan}`);
      console.log(`   Trial Ends At: ${workspace.trialEndsAt}`);
      console.log(`   Created At: ${workspace.createdAt}`);

      const now = new Date();
      const trialEnd = new Date(workspace.trialEndsAt);
      const isExpired = trialEnd < now;

      console.log(`   Current Time: ${now}`);
      console.log(`   Trial Expired: ${isExpired}`);
      console.log(`   Days Left: ${Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24))}`);
      console.log('');
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkWorkspaceTrial();







