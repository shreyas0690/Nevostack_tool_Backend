const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nevostack', { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to DB');

  // Create company if not exists
  let company = await Company.findOne({ domain: 'local.company' });
  if (!company) {
    company = new Company({ name: 'Local Company', domain: 'local.company', email: 'admin@local.company', status: 'active' });
    await company.save();
    console.log('Created company', company._id);
  } else {
    console.log('Company exists', company._id);
  }

  // Create department
  let dept = await Department.findOne({ companyId: company._id, name: 'General' });
  if (!dept) {
    dept = new Department({ companyId: company._id, name: 'General', description: 'Default department' });
    await dept.save();
    console.log('Created department', dept._id);
  }

  // Create admin user
  let admin = await User.findOne({ email: 'admin@local.company' });
  if (!admin) {
    const bcrypt = require('bcryptjs');
    const hashed = await bcrypt.hash('Password123!', 10);
    admin = new User({ username: 'admin', email: 'admin@local.company', password: hashed, firstName: 'Admin', lastName: 'User', role: 'admin', companyId: company._id, status: 'active', departmentId: dept._id });
    await admin.save();
    console.log('Created admin user', admin._id);
  } else {
    console.log('Admin exists', admin._id);
  }

  mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const { User, Company, Department } = require('../models');

const seedData = async () => {
  try {
    console.log('🌱 Starting database seeding...');
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nevostack_hrms', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await User.deleteMany({});
    await Company.deleteMany({});
    await Department.deleteMany({});
    
    // Create default company
    console.log('🏢 Creating default company...');
    const company = await Company.create({
      name: 'NevoStack Technologies',
      domain: 'nevostack',
      email: 'admin@nevostack.com',
      phone: '+1234567890',
      address: {
        street: '123 Tech Street',
        city: 'Tech City',
        state: 'TC',
        country: 'Techland',
        zipCode: '12345'
      },
      status: 'active',
      subscription: {
        plan: 'enterprise',
        status: 'active',
        billingCycle: 'monthly',
        amount: 299.99,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
      }
    });

    // Create departments with proper structure
    console.log('🏛️ Creating departments...');
    const departments = await Department.create([
      {
        name: 'Engineering',
        description: 'Software development and technical operations',
        companyId: company._id,
        status: 'active',
        type: 'main',
        level: 1,
        employeeCount: 0,
        memberIds: [],
        assistantManagerIds: [],
        metadata: {
          color: '#3B82F6',
          icon: 'code',
          location: 'Building A, Floor 2',
          tags: ['development', 'tech']
        },
        settings: {
          allowLeaveRequests: true,
          requireManagerApproval: true,
          maxLeaveDays: 25,
          workingHours: {
            start: '09:00',
            end: '18:00'
          },
          workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
        }
      },
      {
        name: 'Human Resources',
        description: 'HR operations and employee management',
        companyId: company._id,
        status: 'active',
        type: 'main',
        level: 1,
        employeeCount: 0,
        memberIds: [],
        assistantManagerIds: [],
        metadata: {
          color: '#10B981',
          icon: 'users',
          location: 'Building A, Floor 1',
          tags: ['hr', 'people']
        },
        settings: {
          allowLeaveRequests: true,
          requireManagerApproval: true,
          maxLeaveDays: 30,
          workingHours: {
            start: '09:00',
            end: '17:00'
          },
          workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
        }
      },
      {
        name: 'Marketing',
        description: 'Marketing and customer engagement',
        companyId: company._id,
        status: 'active',
        type: 'main',
        level: 1,
        employeeCount: 0,
        memberIds: [],
        assistantManagerIds: [],
        metadata: {
          color: '#8B5CF6',
          icon: 'megaphone',
          location: 'Building B, Floor 1',
          tags: ['marketing', 'creative']
        },
        settings: {
          allowLeaveRequests: true,
          requireManagerApproval: true,
          maxLeaveDays: 20,
          workingHours: {
            start: '10:00',
            end: '18:00'
          },
          workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
        }
      },
      {
        name: 'Sales',
        description: 'Sales operations and customer relations',
        companyId: company._id,
        status: 'active',
        type: 'main',
        level: 1,
        employeeCount: 0,
        memberIds: [],
        assistantManagerIds: [],
        metadata: {
          color: '#F59E0B',
          icon: 'trending-up',
          location: 'Building B, Floor 2',
          tags: ['sales', 'revenue']
        },
        settings: {
          allowLeaveRequests: true,
          requireManagerApproval: true,
          maxLeaveDays: 22,
          workingHours: {
            start: '08:00',
            end: '17:00'
          },
          workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
        }
      }
    ]);

    // Hash password for all users
    const hashedPassword = await bcrypt.hash('password123', 12);

    // Create users
    console.log('👥 Creating users...');
    const users = await User.create([
      // Super Admin
      {
        username: 'superadmin',
        email: 'admin@nevostack.com',
        password: hashedPassword,
        firstName: 'Super',
        lastName: 'Admin',
        role: 'super_admin',
        companyId: company._id,
        status: 'active',
        position: 'System Administrator',
        isEmailVerified: true
      },
      
      // Company Admin
      {
        username: 'companyadmin',
        email: 'company@nevostack.com',
        password: hashedPassword,
        firstName: 'Company',
        lastName: 'Admin',
        role: 'admin',
        companyId: company._id,
        status: 'active',
        position: 'Company Administrator',
        isEmailVerified: true
      },
      
      // HR Manager
      {
        username: 'hrmanager',
        email: 'hrmanager@nevostack.com',
        password: hashedPassword,
        firstName: 'HR',
        lastName: 'Manager',
        role: 'hr_manager',
        companyId: company._id,
        department: departments[1]._id, // HR Department
        status: 'active',
        position: 'HR Manager',
        isEmailVerified: true
      },
      
      // HOD Engineering
      {
        username: 'hodengineering',
        email: 'hod.engineering@nevostack.com',
        password: hashedPassword,
        firstName: 'John',
        lastName: 'Doe',
        role: 'department_head',
        companyId: company._id,
        department: departments[0]._id, // Engineering Department
        status: 'active',
        position: 'Head of Engineering',
        isEmailVerified: true
      },
      
      // Manager
      {
        username: 'manager',
        email: 'manager@nevostack.com',
        password: hashedPassword,
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'manager',
        companyId: company._id,
        department: departments[0]._id, // Engineering Department
        status: 'active',
        position: 'Engineering Manager',
        isEmailVerified: true
      },
      
      // HR Employee
      {
        username: 'hr001',
        email: 'hr@nevostack.com',
        password: hashedPassword,
        firstName: 'Alice',
        lastName: 'Johnson',
        role: 'hr',
        companyId: company._id,
        department: departments[1]._id, // HR Department
        status: 'active',
        position: 'HR Specialist',
        isEmailVerified: true
      },
      
      // Regular Members
      {
        username: 'developer1',
        email: 'dev1@nevostack.com',
        password: hashedPassword,
        firstName: 'Bob',
        lastName: 'Wilson',
        role: 'member',
        companyId: company._id,
        department: departments[0]._id, // Engineering Department
        status: 'active',
        position: 'Senior Developer',
        isEmailVerified: true
      },
      
      {
        username: 'developer2',
        email: 'dev2@nevostack.com',
        password: hashedPassword,
        firstName: 'Carol',
        lastName: 'Brown',
        role: 'member',
        companyId: company._id,
        department: departments[0]._id, // Engineering Department
        status: 'active',
        position: 'Frontend Developer',
        isEmailVerified: true
      },
      
      {
        username: 'marketer',
        email: 'marketing@nevostack.com',
        password: hashedPassword,
        firstName: 'David',
        lastName: 'Miller',
        role: 'member',
        companyId: company._id,
        department: departments[2]._id, // Marketing Department
        status: 'active',
        position: 'Marketing Specialist',
        isEmailVerified: true
      },
      
      {
        username: 'sales',
        email: 'sales@nevostack.com',
        password: hashedPassword,
        firstName: 'Emma',
        lastName: 'Davis',
        role: 'member',
        companyId: company._id,
        department: departments[3]._id, // Sales Department
        status: 'active',
        position: 'Sales Representative',
        isEmailVerified: true
      },
      
      // Person role (no department/company association)
      {
        username: 'person1',
        email: 'person1@example.com',
        password: hashedPassword,
        firstName: 'Jane',
        lastName: 'Person',
        role: 'person',
        status: 'active',
        position: 'Freelancer',
        isEmailVerified: true
      }
    ]);

    // Update department manager IDs
    console.log('🔗 Setting department managers...');
    await Department.findByIdAndUpdate(departments[0]._id, { managerId: users[3]._id }); // Engineering HOD
    await Department.findByIdAndUpdate(departments[1]._id, { managerId: users[2]._id }); // HR Manager
    
    // Set manager relationships
    console.log('👔 Setting manager relationships...');
    await User.findByIdAndUpdate(users[4]._id, { manager: users[3]._id }); // Manager reports to HOD
    await User.findByIdAndUpdate(users[6]._id, { manager: users[4]._id }); // Developer reports to Manager
    await User.findByIdAndUpdate(users[7]._id, { manager: users[4]._id }); // Developer reports to Manager
    await User.findByIdAndUpdate(users[5]._id, { manager: users[2]._id }); // HR reports to HR Manager
    await User.findByIdAndUpdate(users[8]._id, { manager: users[1]._id }); // Marketing reports to Company Admin
    await User.findByIdAndUpdate(users[9]._id, { manager: users[1]._id }); // Sales reports to Company Admin

    console.log('✅ Database seeded successfully!');
    console.log('\n📊 Created:');
    console.log(`   • 1 Company: ${company.name}`);
    console.log(`   • ${departments.length} Departments`);
    console.log(`   • ${users.length} Users`);
    
    console.log('\n🔐 Login Credentials:');
    console.log('   • Super Admin: admin@nevostack.com / password123');
    console.log('   • Company Admin: company@nevostack.com / password123');
    console.log('   • HR Manager: hrmanager@nevostack.com / password123');
    console.log('   • HOD Engineering: hod.engineering@nevostack.com / password123');
    console.log('   • Manager: manager@nevostack.com / password123');
    console.log('   • HR: hr@nevostack.com / password123');
    console.log('   • Developer: dev1@nevostack.com / password123');
    console.log('   • Person: person1@example.com / password123');
    
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

// Run seeding if script is called directly
if (require.main === module) {
  seedData()
    .then(() => {
      console.log('🎉 Seeding completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = seedData;
