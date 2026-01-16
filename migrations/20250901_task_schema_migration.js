// Migration: add workspaceId, createdBy, audit, deleted fields to existing leave documents
module.exports = {
  async up(db) {
    // Add fields with defaults where missing
    await db.collection('leaves').updateMany(
      { workspaceId: { $exists: false } },
      { $set: { workspaceId: null } }
    );

    await db.collection('leaves').updateMany(
      { createdBy: { $exists: false } },
      { $set: { createdBy: null } }
    );

    await db.collection('leaves').updateMany(
      { audit: { $exists: false } },
      { $set: { audit: [] } }
    );

    await db.collection('leaves').updateMany(
      { deleted: { $exists: false } },
      { $set: { deleted: false } }
    );

    // Create index on deleted for soft-deletes
    await db.collection('leaves').createIndex({ deleted: 1 });
  },

  async down(db) {
    // Remove the index and fields (best effort)
    try { await db.collection('leaves').dropIndex('deleted_1'); } catch (e) {}
    await db.collection('leaves').updateMany({}, { $unset: { workspaceId: '', createdBy: '', audit: '', deleted: '' } });
  }
};

/**
 * Migration: Task schema update (2025-09-01)
 * - Map old status values to new status enums
 * - Initialize assigneeType to 'user' if assignedTo exists
 * - Preserve existing assignedTo in new schema
 * - Add a simple assignmentHistory entry for existing tasks
 *
 * Usage: run with node: `node backend/migrations/20250901_task_schema_migration.js`
 * Make sure MONGODB_URI env var is set and points to the correct DB.
 */

const mongoose = require('mongoose');
const Task = require('../models/Task');

const statusMap = {
  assigned: 'assigned',
  in_progress: 'in_progress',
  completed: 'completed',
  blocked: 'cancelled'
};

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nevostack';
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  console.log('Connected to DB, starting migration...');

  const cursor = Task.find().cursor();
  let count = 0;
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const oldStatus = doc.status;
    const mappedStatus = statusMap[oldStatus] || 'todo';
    doc.status = mappedStatus;

    if (!doc.assigneeType) {
      doc.assigneeType = doc.assignedTo ? 'user' : 'role';
    }

    // Add an initial assignmentHistory record if none exists
    if ((!doc.assignmentHistory || doc.assignmentHistory.length === 0) && doc.assignedTo) {
      doc.assignmentHistory = [{
        from: null,
        to: doc.assignedTo,
        by: doc.assignedBy || null,
        byRole: doc.assignedByRole || null,
        at: doc.createdAt || new Date(),
        note: 'Migrated initial assignment'
      }];
    }

    await doc.save();
    count += 1;
    if (count % 100 === 0) console.log(`${count} tasks migrated...`);
  }

  console.log(`Migration complete. ${count} tasks updated.`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});



