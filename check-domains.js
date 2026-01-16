const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nevostack');
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
};

const checkExistingDomains = async () => {
  try {
    const Company = require('./models/Company');
    const Workspace = require('./models/Workspace');

    console.log('\n🔍 Checking existing companies:');
    const companies = await Company.find({}, 'name domain email');
    companies.forEach(company => {
      console.log(`  - ${company.name}: ${company.domain} (${company.email})`);
    });

    console.log('\n🔍 Checking existing workspaces:');
    const workspaces = await Workspace.find({}, 'name subdomain domain');
    workspaces.forEach(workspace => {
      console.log(`  - ${workspace.name}: ${workspace.subdomain} (${workspace.domain})`);
    });

    console.log(`\n📊 Total: ${companies.length} companies, ${workspaces.length} workspaces`);

  } catch (error) {
    console.error('❌ Error checking domains:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

connectDB().then(checkExistingDomains);









