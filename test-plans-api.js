const fetch = require('node-fetch');

// Test script to add plans to database via API
const API_BASE_URL = 'http://localhost:3000/api/saas';

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

// Function to create plans via API
const createPlans = async () => {
  console.log('🌱 Starting to create plans via API...');
  
  // You'll need to get a valid token from your SaaS admin login
  const token = 'YOUR_SAAS_ADMIN_TOKEN_HERE'; // Replace with actual token
  
  for (const planData of plansData) {
    try {
      console.log(`📦 Creating plan: ${planData.displayName}...`);
      
      const response = await fetch(`${API_BASE_URL}/plans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(planData)
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Successfully created plan: ${planData.displayName}`);
      } else {
        const error = await response.text();
        console.error(`❌ Failed to create plan ${planData.displayName}:`, error);
      }
    } catch (error) {
      console.error(`❌ Error creating plan ${planData.displayName}:`, error);
    }
  }
  
  console.log('🎉 Plan creation completed!');
};

// Function to fetch existing plans
const fetchPlans = async () => {
  try {
    console.log('📋 Fetching existing plans...');
    
    const response = await fetch(`${API_BASE_URL}/plans`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Add authorization header if needed
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Existing plans:', data.data?.length || 0);
      data.data?.forEach(plan => {
        console.log(`   - ${plan.displayName} (${plan.name}) - $${plan.price.monthly}/month`);
      });
    } else {
      console.error('❌ Failed to fetch plans:', response.status);
    }
  } catch (error) {
    console.error('❌ Error fetching plans:', error);
  }
};

// Run the functions
const runTest = async () => {
  console.log('🚀 Testing Plans API...');
  console.log('📝 Note: Make sure the backend server is running on port 3000');
  console.log('🔑 Note: You need to replace the token with a valid SaaS admin token');
  console.log('');
  
  await fetchPlans();
  console.log('');
  // Uncomment the line below to create plans (after setting a valid token)
  // await createPlans();
};

runTest();










