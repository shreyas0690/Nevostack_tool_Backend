const mongoose = require('mongoose');

// Connect to MongoDB
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb+srv://agamonjprince785:Agamon123@cluster0.qjfxyto.mongodb.net/NevoStackTool?retryWrites=true&w=majority&appName=Cluster0"

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const checkCompanies = async () => {
  try {
    // Import Company model
    const Company = require('./models/Company');

    // Get all companies
    const companies = await Company.find({}).select('name domain email createdAt');

    console.log('Existing Companies:');
    console.log('==================');
    if (companies.length === 0) {
      console.log('No companies found in database');
    } else {
      companies.forEach((company, index) => {
        console.log(`${index + 1}. ${company.name}`);
        console.log(`   Domain: ${company.domain}`);
        console.log(`   Email: ${company.email}`);
        console.log(`   Created: ${company.createdAt}`);
        console.log('');
      });
    }

    // Check specific domains
    const testDomains = ['agamon.nevostack.com', 'test.nevostack.com', 'newtest.nevostack.com'];
    console.log('Domain Availability Check:');
    console.log('==========================');

    for (const domain of testDomains) {
      const existing = await Company.findOne({ domain });
      console.log(`${domain}: ${existing ? '❌ TAKEN' : '✅ AVAILABLE'}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
};

const run = async () => {
  await connectDB();
  await checkCompanies();
};

run();
