/* eslint-disable no-console */
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../lib/mongodb');
const { User, Task, Meeting } = require('../models');

const args = process.argv.slice(2);

const hasFlag = (flag) => args.includes(flag);
const getFlagValue = (flag) => {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] || null;
};

const dryRun = hasFlag('--dry-run');
const companyId = getFlagValue('--companyId');
const userId = getFlagValue('--userId');
const limitArg = getFlagValue('--limit');
const limit = limitArg ? Number(limitArg) : 0;
const skipTasks = hasFlag('--skip-tasks');
const skipMeetings = hasFlag('--skip-meetings');
const verbose = hasFlag('--verbose');

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const logUsage = () => {
  console.log('Usage: node backend/scripts/sync-member-department-links.js [options]');
  console.log('Options:');
  console.log('  --dry-run           Show counts without updating');
  console.log('  --companyId <id>    Limit to a company');
  console.log('  --userId <id>       Limit to a single member');
  console.log('  --limit <n>         Process only first n members');
  console.log('  --skip-tasks        Skip task updates');
  console.log('  --skip-meetings     Skip meeting updates');
  console.log('  --verbose           Log per-user changes');
};

if (hasFlag('--help')) {
  logUsage();
  process.exit(0);
}

const buildUserQuery = () => {
  const query = { role: 'member' };
  if (companyId) query.companyId = companyId;
  if (userId) query._id = userId;
  return query;
};

const getUserDepartmentId = (user) => {
  const rawDept = user.departmentId || user.department;
  if (!rawDept) return null;
  const deptId = String(rawDept);
  if (!isValidObjectId(deptId)) return null;
  return deptId;
};

const main = async () => {
  await connectDB();

  const userQuery = buildUserQuery();
  const users = await User.find(userQuery)
    .select('_id departmentId department companyId email name')
    .lean();

  console.log(`Found ${users.length} member(s) to scan.`);

  let processed = 0;
  let skipped = 0;
  let tasksAffected = 0;
  let meetingsAffected = 0;

  for (const user of users) {
    if (limit && processed >= limit) break;

    const deptId = getUserDepartmentId(user);
    if (!deptId) {
      skipped += 1;
      if (verbose) console.log(`Skipping user ${user._id}: missing/invalid department.`);
      continue;
    }

    const deptObjectId = new mongoose.Types.ObjectId(deptId);
    processed += 1;

    if (!skipTasks) {
      const taskMatch = {
        $and: [
          { $or: [{ assignedTo: user._id }, { assignedToList: user._id }] },
          {
            $or: [
              { departmentId: { $exists: false } },
              { departmentId: null },
              { departmentId: { $ne: deptObjectId } }
            ]
          }
        ]
      };

      if (dryRun) {
        const count = await Task.countDocuments(taskMatch);
        tasksAffected += count;
        if (verbose && count) console.log(`[DRY RUN] user ${user._id} -> ${count} task(s)`);
      } else {
        const result = await Task.updateMany(taskMatch, { $set: { departmentId: deptObjectId } });
        const updated = typeof result.modifiedCount === 'number' ? result.modifiedCount : (result.nModified || 0);
        tasksAffected += updated;
        if (verbose && updated) console.log(`user ${user._id} updated ${updated} task(s)`);
      }
    }

    if (!skipMeetings) {
      const meetingMatch = {
        $and: [
          { $or: [{ inviteeUserIds: user._id }, { 'participants.user': user._id }] },
          {
            $or: [
              { departmentIds: { $exists: false } },
              { departmentIds: { $ne: deptObjectId } }
            ]
          }
        ]
      };

      if (dryRun) {
        const count = await Meeting.countDocuments(meetingMatch);
        meetingsAffected += count;
        if (verbose && count) console.log(`[DRY RUN] user ${user._id} -> ${count} meeting(s)`);
      } else {
        const result = await Meeting.updateMany(meetingMatch, { $addToSet: { departmentIds: deptObjectId } });
        const updated = typeof result.modifiedCount === 'number' ? result.modifiedCount : (result.nModified || 0);
        meetingsAffected += updated;
        if (verbose && updated) console.log(`user ${user._id} updated ${updated} meeting(s)`);
      }
    }
  }

  console.log('---');
  console.log(`Processed users: ${processed}`);
  console.log(`Skipped users (no department): ${skipped}`);
  if (!skipTasks) {
    console.log(`${dryRun ? 'Would update' : 'Updated'} tasks: ${tasksAffected}`);
  }
  if (!skipMeetings) {
    console.log(`${dryRun ? 'Would update' : 'Updated'} meetings: ${meetingsAffected}`);
  }

  await disconnectDB();
};

main().catch(async (error) => {
  console.error('Sync failed:', error);
  await disconnectDB();
  process.exit(1);
});
