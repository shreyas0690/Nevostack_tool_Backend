const http = require('http');

// Get workspace details to find admin user
console.log('🔍 Getting workspace "forever" details...\n');

const getWorkspaceDetails = () => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/workspaces/subdomain/forever',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(data);
        } catch (e) {
          reject(new Error(`Parse error: ${body}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Request error: ${e.message}`));
    });

    req.end();
  });
};

// Get user details by ID
const getUserDetails = (userId) => {
  return new Promise((resolve, reject) => {
    // Note: We don't have a direct API to get user by ID without authentication
    // But we can try to infer from the workspace data
    resolve(null); // Will handle this differently
  });
};

// Main execution
async function findAdminUser() {
  try {
    const workspaceData = await getWorkspaceDetails();

    if (workspaceData.success && workspaceData.workspace) {
      const workspace = workspaceData.workspace;

      console.log('🏢 Workspace Details:');
      console.log(`   📋 Name: ${workspace.name}`);
      console.log(`   🌐 Subdomain: ${workspace.subdomain}`);
      console.log(`   🏢 Domain: ${workspace.domain}`);
      console.log(`   📊 Status: ${workspace.status}`);
      console.log(`   🏷️ Plan: ${workspace.plan}`);
      console.log(`   👤 Owner ID: ${workspace._id || workspace.ownerId}`);
      console.log(`   🏢 Company ID: ${workspace.companyId}`);
      console.log('');

      // Try to find admin user through different methods
      console.log('🔍 Looking for Admin User:');
      console.log('');

      // Method 1: Check common admin usernames
      const commonAdminCredentials = [
        { username: 'admin', email: 'admin@forever.com' },
        { username: 'administrator', email: 'admin@forever.com' },
        { username: workspace.name.toLowerCase().replace(/\s+/g, ''), email: `admin@${workspace.subdomain}.com` },
        { username: 'owner', email: 'owner@forever.com' },
        { username: workspace.subdomain, email: `${workspace.subdomain}@nevostack.com` }
      ];

      console.log('💡 Possible Admin Credentials:');
      commonAdminCredentials.forEach((cred, index) => {
        console.log(`   ${index + 1}. Username: ${cred.username}`);
        console.log(`      Email: ${cred.email}`);
        console.log(`      Password: [Try common passwords or check with workspace creator]`);
        console.log('');
      });

      console.log('🎯 Recommendation:');
      console.log('   1. Try these common credentials first');
      console.log('   2. If none work, the workspace creator has the original password');
      console.log('   3. Or create a new admin user for this workspace');
      console.log('');

      console.log('📞 Next Steps:');
      console.log('   Tell me which credentials you want to test, and I\'ll help you login!');

    } else {
      console.log('❌ Workspace "forever" not found');
      console.log('Response:', JSON.stringify(workspaceData, null, 2));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

findAdminUser();







