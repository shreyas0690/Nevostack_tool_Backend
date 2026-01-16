const mongoose = require('mongoose');

// Connect to MongoDB using same config as server
const mongoUri = process.env.MONGODB_URI || "mongodb+srv://agamonjprince785:Agamon123@cluster0.qjfxyto.mongodb.net/NevoStackTool?retryWrites=true&w=majority&appName=Cluster0";

const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4
};

mongoose.connect(mongoUri, options)
.then(() => {
  console.log('Connected to MongoDB');
  testRegistration();
})
.catch(err => {
  console.error('MongoDB connection error:', err);
});

async function testRegistration() {
  try {
    // Import models
    const { Company, User, Workspace } = require('./models');

    console.log('Models loaded:', {
      Company: !!Company,
      User: !!User,
      Workspace: !!Workspace
    });

    // Test data
    const testData = {
      companyName: 'Test Company',
      companyEmail: 'test@example.com',
      companyPhone: '1234567890',
      domain: 'test.nevostack.com',
      firstName: 'John',
      lastName: 'Doe',
      adminEmail: 'admin@example.com',
      adminUsername: 'admin',
      adminPassword: 'password123'
    };

    console.log('Test data:', testData);

    // Create company
    const company = new Company({
      name: testData.companyName,
      email: testData.companyEmail,
      phone: testData.companyPhone,
      domain: testData.domain
    });

    await company.save();
    console.log('Company created:', company._id);

    // Create admin user
    const adminUser = new User({
      username: testData.adminUsername,
      email: testData.adminEmail,
      password: 'password123',
      firstName: testData.firstName,
      lastName: testData.lastName,
      role: 'admin',
      companyId: company._id
    });

    await adminUser.save();
    console.log('Admin user created:', adminUser._id);

    // Create workspace
    const workspace = await Workspace.createWorkspace({
      name: `${company.name} Workspace`,
      subdomain: testData.domain.split('.')[0],
      domain: testData.domain,
      companyId: company._id,
      ownerId: adminUser._id,
      plan: 'starter',
      status: 'trial'
    });

    console.log('Workspace created:', workspace._id);

    console.log('✅ Test completed successfully!');

  } catch (error) {
    console.error('Test failed:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}
