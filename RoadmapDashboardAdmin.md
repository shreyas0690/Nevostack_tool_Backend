# RoadmapDashboardAdmin

This file defines the admin-focused backend roadmap to support the Admin Panel Dashboard frontend.

- **Purpose**
  - Provide concise, actionable steps for implementing company-scoped admin APIs, data isolation, and frontend integration required by the dashboard.

- **Admin responsibilities**
  - Manage companies (create, update, suspend)
  - Manage users within a company (invite, update roles, deactivate)
  - View company-wide analytics and export reports
  - Configure company settings (branding, timezone, features)

- **Security & isolation**
  - Every company-scoped collection must include `companyId` and an index on it.
  - Auth JWT includes `companyId` and `role`. Middleware (`authenticateToken`, `requireCompanyAccess`) must enforce scope.
  - Super-admin (platform) role can access cross-company endpoints; regular admins only their company.

- **Core admin endpoints (recommended)**
  - GET `/api/companies` — platform: list companies (super-admin)
  - GET `/api/companies/:id` — view company details
  - POST `/api/companies` — create company (super-admin or provisioning service)
  - PATCH `/api/companies/:id` — update company settings
  - GET `/api/companies/:id/stats` — company KPIs for admin
  - GET `/api/users?companyId=` — paginated users filtered by `companyId`
  - POST `/api/users/invite` — invite user to company
  - PATCH `/api/users/:id/role` — change user role (company admin only)

- **Analytics & exports**
  - GET `/api/analytics/overview?companyId=` — KPIs for dashboard charts
  - GET `/api/analytics/tasks/timeseries?companyId=&groupBy=` — used by charts
  - GET `/api/analytics/export?companyId=&type=csv|pdf&report=overview` — export reports

- **Integration checklist for frontend**
  - Ensure `API_CONFIG.BASE_URL` points to backend and endpoints match `API_CONFIG.ENDPOINTS`.
  - After login, store `accessToken`, `refreshToken`, `user`, and `device` in localStorage as frontend expects.
  - Ensure responses for analytics endpoints include `byDepartment`, `topPerformers`, `tasksByStatus`, and `tasksByPriority` fields.

- **Dev steps**
  1. Add admin routes under `backend/routes/companies.js` and `backend/routes/admin.js` (apply `requireRole(['super_admin'])` where needed).
  2. Add model indexes for `companyId` on `Task`, `Leave`, `Department`, `User` models.
  3. Seed at least one company + admin user (see `backend/scripts/seed.js`) and verify login from frontend.
  4. Implement analytics endpoints and test charts using frontend dev server.

- **Notes**
  - Keep query limits and pagination defaults conservative (e.g., limit=50) to avoid heavy queries.
  - Cache expensive aggregation endpoints (Redis) if response time is >200ms in dev.













