const mongoose = require('mongoose');
const Plan = require('./models/Plan');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nevostack', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Sample plans data
const plansData = [
  {
    name: 'free',
    displayName: 'Free',
    description: 'Perfect for startups and small teams',
    price: { 
      monthly: 0, 
      quarterly: 0, 
      yearly: 0 
    },
    limits: { 
      maxUsers: 5, 
      maxDepartments: 2, 
      storageGB: 1 
    },
    features: {
      taskManagement: true,
      leaveManagement: false,
      meetings: false,
      analytics: false,
      reports: false,
      attendance: false,
      apiAccess: false,
      customBranding: false
    },
    trialDays: 14,
    isActive: true,
    isPopular: false,
    sortOrder: 1
  },
  {
    name: 'standard',
    displayName: 'Standard',
    description: 'Great for growing businesses',
    price: { 
      monthly: 29, 
      quarterly: 79, 
      yearly: 299 
    },
    limits: { 
      maxUsers: 25, 
      maxDepartments: 5, 
      storageGB: 10 
    },
    features: {
      taskManagement: true,
      leaveManagement: true,
      meetings: true,
      analytics: false,
      reports: true,
      attendance: true,
      apiAccess: false,
      customBranding: false
    },
    trialDays: 14,
    isActive: true,
    isPopular: true,
    sortOrder: 2
  },
  {
    name: 'premium',
    displayName: 'Premium',
    description: 'Advanced features for established companies',
    price: { 
      monthly: 59, 
      quarterly: 159, 
      yearly: 599 
    },
    limits: { 
      maxUsers: 100, 
      maxDepartments: 15, 
      storageGB: 50 
    },
    features: {
      taskManagement: true,
      leaveManagement: true,
      meetings: true,
      analytics: true,
      reports: true,
      attendance: true,
      apiAccess: true,
      customBranding: false
    },
    trialDays: 14,
    isActive: true,
    isPopular: false,
    sortOrder: 3
  },
  {
    name: 'enterprise',
    displayName: 'Enterprise',
    description: 'Full-featured solution for large organizations',
    price: { 
      monthly: 99, 
      quarterly: 279, 
      yearly: 999 
    },
    limits: { 
      maxUsers: -1, 
      maxDepartments: -1, 
      storageGB: 500 
    },
    features: {
      taskManagement: true,
      leaveManagement: true,
      meetings: true,
      analytics: true,
      reports: true,
      attendance: true,
      apiAccess: true,
      customBranding: true
    },
    trialDays: 30,
    isActive: true,
    isPopular: false,
    sortOrder: 4
  }
];

// Seed function
const seedPlans = async () => {
  try {
    console.log('🌱 Starting to seed plans...');
    
    // Clear existing plans
    await Plan.deleteMany({});
    console.log('🗑️ Cleared existing plans');
    
    // Insert new plans
    const createdPlans = await Plan.insertMany(plansData);
    console.log(`✅ Successfully created ${createdPlans.length} plans:`);
    
    createdPlans.forEach(plan => {
      console.log(`   - ${plan.displayName} (${plan.name}) - $${plan.price.monthly}/month`);
    });
    
    console.log('🎉 Plans seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding plans:', error);
  } finally {
    mongoose.connection.close();
    console.log('📡 Database connection closed');
  }
};

// Run the seeding
const runSeed = async () => {
  await connectDB();
  await seedPlans();
};

// Check if this script is run directly
if (require.main === module) {
  runSeed();
}

module.exports = { seedPlans, plansData };










