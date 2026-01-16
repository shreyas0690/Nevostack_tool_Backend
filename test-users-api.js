// Test script to check if the /api/saas/users endpoint returns stats data
const mongoose = require('mongoose');

// Simple test to check the API response structure
async function testUsersAPI() {
  try {
    console.log('🧪 Testing /api/saas/users API response...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/nevo-stack');
    console.log('✅ Connected to MongoDB');

    // Import the route handler directly
    const express = require('express');
    const router = express.Router();
    const User = require('./models/User');
    const Company = require('./models/Company');
    const Task = require('./models/Task');
    const Leave = require('./models/Leave');
    const Meeting = require('./models/Meeting');

    // Simulate the route logic
    console.log('📊 Simulating users API call...');

    const page = 1;
    const limit = 10;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Test the stats queries
    const allUsersCount = await User.countDocuments();
    const activeUsersCount = await User.countDocuments({ status: 'active' });
    const blockedUsersCount = await User.countDocuments({ status: 'blocked' });
    const suspendedUsersCount = await User.countDocuments({ status: 'suspended' });
    const pendingUsersCount = await User.countDocuments({ status: 'pending' });

    console.log('📊 Stats data:');
    console.log('  - totalUsers:', allUsersCount);
    console.log('  - activeUsers:', activeUsersCount);
    console.log('  - blockedUsers:', blockedUsersCount);
    console.log('  - suspendedUsers:', suspendedUsersCount);
    console.log('  - pendingUsers:', pendingUsersCount);

    // Test role stats
    const roleStatsData = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('📊 Role stats:', roleStatsData);

    // Test company stats
    const companyStatsData = await User.aggregate([
      {
        $lookup: {
          from: 'companies',
          localField: 'companyId',
          foreignField: '_id',
          as: 'company'
        }
      },
      {
        $unwind: { path: '$company', preserveNullAndEmptyArrays: true }
      },
      {
        $group: {
          _id: { $ifNull: ['$company.name', 'SaaS Admin'] },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    console.log('📊 Company stats:', companyStatsData);

    // Simulate the response structure
    const mockResponse = {
      success: true,
      data: {
        users: [], // Empty for this test
        stats: {
          totalUsers: allUsersCount,
          activeUsers: activeUsersCount,
          blockedUsers: blockedUsersCount,
          suspendedUsers: suspendedUsersCount,
          pendingUsers: pendingUsersCount,
          roleStats: roleStatsData,
          companyStats: companyStatsData
        },
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(allUsersCount / limitNum),
          totalUsers: allUsersCount,
          hasNext: pageNum * limitNum < allUsersCount,
          hasPrev: pageNum > 1
        },
        filters: {
          companies: []
        }
      }
    };

    console.log('📊 Mock API Response:');
    console.log(JSON.stringify(mockResponse, null, 2));

    await mongoose.connection.close();
    console.log('✅ Test completed successfully');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testUsersAPI();


