// Simple test to check the API response
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/saas/users?page=1&limit=10&search=&role=all&status=all&company=all',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN_HERE' // You'll need to replace this
  }
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`, res.headers);

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const parsedData = JSON.parse(data);
      console.log('Response data structure:');
      console.log('Success:', parsedData.success);
      console.log('Data keys:', Object.keys(parsedData.data || {}));
      if (parsedData.data && parsedData.data.stats) {
        console.log('Stats keys:', Object.keys(parsedData.data.stats));
        console.log('Stats values:', parsedData.data.stats);
      } else {
        console.log('No stats found in response');
      }
    } catch (e) {
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();


