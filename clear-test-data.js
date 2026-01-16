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

const clearTestData = async () => {
  try {
    const Company = require('./models/Company');
    const User = require('./models/User');
    const Workspace = require('./models/Workspace');

    // Find test companies (excluding AMOR which seems like real data)
    const testCompanies = await Company.find({
      name: { $in: ['Test Company', 'New Test Company', 'Fresh Test Company'] }
    });

    console.log('🗑️  Clearing test data...');

    for (const company of testCompanies) {
      console.log(`  Deleting company: ${company.name} (${company.domain})`);

      // Delete associated users
      const deletedUsers = await User.deleteMany({ companyId: company._id });
      console.log(`    - Deleted ${deletedUsers.deletedCount} users`);

      // Delete associated workspaces
      const deletedWorkspaces = await Workspace.deleteMany({ companyId: company._id });
      console.log(`    - Deleted ${deletedWorkspaces.deletedCount} workspaces`);

      // Delete company
      await Company.deleteOne({ _id: company._id });
      console.log(`    - Deleted company`);
    }

    console.log('✅ Test data cleared successfully!');

    // Show remaining data
    const remainingCompanies = await Company.countDocuments();
    const remainingUsers = await User.countDocuments();
    const remainingWorkspaces = await Workspace.countDocuments();

    console.log(`📊 Remaining data: ${remainingCompanies} companies, ${remainingUsers} users, ${remainingWorkspaces} workspaces`);

  } catch (error) {
    console.error('❌ Error clearing test data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Ask for confirmation before clearing
console.log('⚠️  This will delete test companies and their associated users/workspaces');
console.log('Companies to be deleted: Test Company, New Test Company, Fresh Test Company');

connectDB().then(clearTestData);









