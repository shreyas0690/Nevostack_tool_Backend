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

// Plans data with correct pricing structure
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
      monthly: 2400, 
      quarterly: 6500, 
      yearly: 25000 
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
      monthly: 4900, 
      quarterly: 13200, 
      yearly: 50000 
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
      monthly: 8200, 
      quarterly: 23200, 
      yearly: 83000 
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

// Function to add plans to database
const addPlansToDB = async () => {
  try {
    console.log('🌱 Starting to add plans to database...');
    
    // Check if plans already exist
    const existingPlans = await Plan.find({});
    if (existingPlans.length > 0) {
      console.log(`📋 Found ${existingPlans.length} existing plans. Clearing them first...`);
      await Plan.deleteMany({});
      console.log('🗑️ Cleared existing plans');
    }
    
    // Insert new plans
    const createdPlans = await Plan.insertMany(plansData);
    console.log(`✅ Successfully added ${createdPlans.length} plans to database:`);
    
    createdPlans.forEach(plan => {
      console.log(`   📦 ${plan.displayName} (${plan.name})`);
      console.log(`      💰 Monthly: $${plan.price.monthly}, Quarterly: $${plan.price.quarterly}, Yearly: $${plan.price.yearly}`);
      console.log(`      👥 Max Users: ${plan.limits.maxUsers === -1 ? 'Unlimited' : plan.limits.maxUsers}`);
      console.log(`      🏢 Max Departments: ${plan.limits.maxDepartments === -1 ? 'Unlimited' : plan.limits.maxDepartments}`);
      console.log(`      💾 Storage: ${plan.limits.storageGB}GB`);
      console.log(`      ⭐ Popular: ${plan.isPopular ? 'Yes' : 'No'}`);
      console.log('');
    });
    
    console.log('🎉 Plans successfully added to database!');
    console.log('📝 You can now view them in the frontend Subscription → Plans section');
    
  } catch (error) {
    console.error('❌ Error adding plans to database:', error);
  } finally {
    mongoose.connection.close();
    console.log('📡 Database connection closed');
  }
};

// Run the function
const runAddPlans = async () => {
  await connectDB();
  await addPlansToDB();
};

// Check if this script is run directly
if (require.main === module) {
  runAddPlans();
}

module.exports = { addPlansToDB, plansData };
