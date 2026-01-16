<!-- Leave Management System Roadmap -->

# Leave Management System Roadmap

This document outlines a complete roadmap for implementing a Leave Management System supporting four roles: Admin, HOD, Manager, and Member. It covers requirements, data models, API design, frontend pages and components, UI/UX flows, permissions, edge cases, tests, migrations, and an implementation timeline.

## 1. Overview

- Purpose: Allow users (HOD, Manager, Member) to request leaves, view their leave history, and let Admin manage all requests (view/approve/reject/create on behalf of users).
- Roles: `Admin`, `HOD`, `Manager`, `Member`.
- Key features:
  - Request leave (start date, end date, type, reason, attachments optional)
  - Leave history for each user
  - Admin view for all leaves with filters and bulk actions
  - Admin impersonation: create leave on behalf of any user
  - Notifications (email/in-app) for request created, approved, rejected
  - Audit log for actions

## 2. Roles & Permissions (Detailed)

- **Admin (full access)**
  - View all leave requests across companies/workspaces
  - Approve/Reject any leave
  - Create leave for any user
  - Edit/Delete leave requests (with audit trail)
  - Filter and export leaves

- **HOD**
  - Create leave for self
  - View own leave history
  - Receive notifications for approvals/rejections

- **Manager**
  - Create leave for self
  - View own leave history
  - Receive notifications for approvals/rejections

- **Member**
  - Create leave for self
  - View own leave history
  - Receive notifications for approvals/rejections

Permissions matrix (summary):

- `CreateLeave`: Admin (for any user), HOD/Manager/Member (self)
- `ViewLeave`: Admin (all), HOD/Manager/Member (self only)
- `ApproveLeave`: Admin only (if organization requires HOD/Manager approve then extend matrix)
- `EditLeave`: Admin (any), user (only pending own requests)

> Note: If organizational policy requires manager or HOD approvals before Admin final decision, extend roles to include `Approver` flow. This roadmap assumes Admin is the final approver.

## 3. Data Models

Add a `Leave` model to `backend/models/Leave.js` (or `Leave.ts` for types). Suggested schema:

```js
{
  _id: ObjectId,
  userId: ObjectId,        // reference to User
  workspaceId: ObjectId,   // reference to Workspace
  companyId: ObjectId,     // optional
  roleAtRequest: String,   // 'HOD'|'Manager'|'Member'|'Admin' (role of user when requested)
  type: String,            // 'Sick'|'Casual'|'Paid'|'Unpaid' etc.
  startDate: Date,
  endDate: Date,
  durationDays: Number,
  status: String,          // 'Pending'|'Approved'|'Rejected'|'Cancelled'
  reason: String,
  attachments: [ { url, filename, mimeType } ],
  createdBy: ObjectId,     // who created the record (could be Admin creating for user)
  approvedBy: ObjectId,    // who approved/rejected
  approvedAt: Date,
  createdAt: Date,
  updatedAt: Date,
  audit: [ { action, by, at, meta } ]
}
```

Indexes:
- Index on `userId` for user history queries
- Index on `workspaceId` + `status` for admin filters
- TTL or archival process for old records as needed

## 4. API Design

All routes should be under `/api/leaves` or `routes/leaves.js`.

- `GET /api/leaves`
  - Admin: returns all leaves (supports filters: userId, status, dateRange, type, workspaceId, companyId)
  - User: returns own leaves (using auth middleware to limit)

- `GET /api/leaves/:id` - return one leave (admin can view any; user can view own)

- `POST /api/leaves` - create leave
  - Body: { userId? (optional for admin), type, startDate, endDate, reason, attachments? }
  - If `userId` provided: only Admin can create for other users. If omitted, create for current user.

- `PUT /api/leaves/:id` - edit leave
  - Only Admin can edit any; users can edit own leaves if status is `Pending`.

- `POST /api/leaves/:id/approve` - approve leave
  - Only Admin (or approvers if policy changes). Sets status to `Approved`, sets `approvedBy`, `approvedAt`.

- `POST /api/leaves/:id/reject` - reject leave
  - Only Admin. Sets status to `Rejected`, sets `approvedBy`, `approvedAt`, and optional `rejectionReason`.

- `POST /api/leaves/:id/cancel` - cancel leave (user or admin)

- `DELETE /api/leaves/:id` - delete (Admin only) or soft-delete with flag `deleted: true`.

Authentication & Authorization:
- Use existing `middleware/auth.js` to attach `req.user` and role. Enforce role checks in route handlers or via policy middleware.

Validation:
- Validate date ranges (start <= end), conflict with existing approved leaves, and leave balance (if tracking balances).

Notifications:
- Emit events to notification system on create/approve/reject.

Audit:
- Push audit entry into `audit` array for each significant action.

## 5. Frontend Pages & Components

Assuming frontend structure similar to `tiny-typer-tool-09/src` layout, add new pages and components.

- Pages:
  - `LeavesPage` (Admin view): shows table of all leaves with filters, search, export, bulk approve/reject
  - `MyLeavesPage` (User view): shows logged-in user's leave history and button to create leave
  - `LeaveDetailModal` or page: shows full details, attachments, audit log, and actions (approve/reject for admin)

- Components:
  - `LeaveRequestForm` (used in modal or page) — fields: type, startDate, endDate, reason, attachments, optionally user select (Admin)
  - `LeaveList` — reusable list/table component with pagination, sorting, filters
  - `LeaveFilters` — filters for admin: status, date range, user select, type
  - `LeaveRow` — row with quick actions
  - `LeaveHistoryCard` — small card for user dashboard

UI Behavior:
- When a user submits a leave, show success toast and append to their `MyLeavesPage` without full refresh (optimistic update). Admin receives notification.
- Admin can click a leave to open detail modal and approve/reject with optional comment.

Design Notes:
- Use consistent date pickers from existing UI library.
- Provide clear statuses with color codes (Pending=orange, Approved=green, Rejected=red, Cancelled=gray).

## 6. UI Flows

- Create Leave (User):
  1. User opens `MyLeavesPage` -> clicks `Request Leave` -> `LeaveRequestForm` appears
  2. User fills fields -> submit -> frontend calls `POST /api/leaves` -> on success show toast and add to list

- Create Leave (Admin for other user):
  1. Admin opens `LeavesPage` -> clicks `Create Leave` -> selects user from dropdown -> fills fields -> submit -> backend creates record with `createdBy`=admin

- Approve/Reject (Admin):
  1. Admin selects a leave -> `LeaveDetailModal` -> clicks `Approve` or `Reject` -> POST to `/api/leaves/:id/approve` or `/api/leaves/:id/reject` -> update table

## 7. Edge Cases & Business Rules

- Overlapping leaves: validate and either block or warn (policy decision)
- Partial-day leaves: if needed, extend schema with `startTime`/`endTime` and `durationHours`
- Leave balances: if tracked, deduct on approval and block if insufficient balance
- Timezones: store dates in UTC, display in user's timezone
- Attachments: limit size and scan for malware; store in secure object storage

## 8. Security & Privacy

- Enforce RBAC on server-side for all endpoints
- Validate `userId` in create endpoints when admin passes it to ensure it belongs to admin's workspace
- Rate-limit create/edit endpoints to prevent abuse
- Log sensitive actions in audit table

## 9. Tests

- Unit tests for model validations (date ranges, required fields)
- Integration tests for routes:
  - User cannot create leave for other user
  - Admin can create leave for any user
  - Approve/Reject transitions update statuses and audit
- Frontend tests for `LeaveRequestForm`, `LeaveList` behaviors

## 10. Database Migration

- Add migration `2025xxxx_add_leave_model.js` to create `leaves` collection and appropriate indexes.

Example for migration script:
```js
// create collection and indexes
db.createCollection('leaves');
db.leaves.createIndex({ userId: 1 });
db.leaves.createIndex({ workspaceId: 1, status: 1 });
```

## 11. Implementation Plan & Timeline (suggested milestones)

- Week 1: Schema + migration + backend routes (CRUD + approve/reject) + unit tests
- Week 2: Frontend pages/components (`MyLeavesPage`, `LeavesPage`, forms, list`) + integration with API
- Week 3: Notifications, attachments, audit log, polish UI, and accessibility
- Week 4: Testing, performance, and rollout (migrations + data copy if needed)

## 12. Example API Contract (JSON)

- Create leave request (POST /api/leaves)

Request:
```json
{
  "userId": "60f8a2...", // optional for admin
  "type": "Sick",
  "startDate": "2025-09-10",
  "endDate": "2025-09-12",
  "reason": "High fever",
  "attachments": []
}
```

Response: 201 Created with leave object

## 13. Developer Notes

- Reuse existing auth middleware in `backend/middleware/auth.js` and user model to check permissions.
- Add feature flags if you want to toggle leave management on/off per workspace.

## 14. Open Questions / Decisions

- Who approves leaves in normal flow? Only Admin or manager/HOD? If managers/HOD should approve, add approval workflow with multi-stage statuses.
- Track leave balances? If yes, create `LeaveBalance` model and tie into approval flow.

---

This roadmap is designed to map directly onto the existing backend layout in this repository. I can implement the backend `Leave` model, routes in `routes/leaves.js`, and basic frontend pages/components next if you want — tell me which piece to start with.


