console.log('🧪 Testing Trial Date Calculation...\n');

// Test the same calculation as in Workspace model
const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
const now = new Date();

console.log(`📅 Current Time: ${now}`);
console.log(`⏰ Trial Ends At: ${trialEndsAt}`);
console.log(`📊 Days from now: ${Math.ceil((trialEndsAt - now) / (1000 * 60 * 60 * 24))}`);
console.log(`✅ Trial is valid: ${trialEndsAt > now}`);

console.log('\n🔍 Detailed breakdown:');
console.log(`   14 days in milliseconds: ${14 * 24 * 60 * 60 * 1000}`);
console.log(`   Current timestamp: ${Date.now()}`);
console.log(`   Trial timestamp: ${trialEndsAt.getTime()}`);
console.log(`   Difference: ${(trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)} days`);







