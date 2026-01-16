# ROADMAP for Admin Panel Dashboard Backend

This document outlines the backend implementation plan to support the existing Admin Panel Dashboard frontend.

- **Goal**: Provide Node.js + Express APIs with MongoDB storage, secure JWT auth, and company-scoped data isolation. Integrate with existing frontend endpoints defined in `tiny-typer-tool-09/src/config/api.ts`.

- **Dashboard sections (from frontend analysis)**
  - Overview: key stats (users, tasks, leaves, revenue etc.)
  - Analytics: charts and timeseries (tasks, leaves, performance)
  - Departments: lists, performance per department
  - Users / Admin: user management, user stats
  - Meetings & Events: lists and stats
  - Leaves & Attendance: timeseries and counts
  - SaaS Platform (super-admin): companies, subscriptions, platform metrics

- **High-level API list** (match frontend `API_CONFIG.ENDPOINTS` keys):
  - Auth: `POST /api/auth/login`, `GET /api/auth/profile`, `POST /api/auth/register` (company), `POST /api/auth/refresh`
  - Users: `GET /api/users`, `GET /api/users/:id`, `GET /api/users/stats`
  - Departments: `GET /api/departments`, `GET /api/departments/:id`, `GET /api/departments/:id/employees`, `GET /api/departments/stats`
  - Tasks: `GET /api/tasks`, `GET /api/tasks/stats`, `POST /api/tasks/assign`, `PATCH /api/tasks/:id/status`
  - Leaves: `GET /api/leaves`, `GET /api/leaves/stats`, `GET /api/leaves/timeseries`
  - Analytics: `GET /api/analytics/overview`, `GET /api/analytics/tasks/timeseries`, `GET /api/analytics/leaves/timeseries`, `GET /api/analytics/performance`
  - Meetings: `GET /api/meetings`, `GET /api/meetings/stats`
  - Companies (SaaS): `GET /api/companies`, `GET /api/companies/:id`, `GET /api/companies/stats`

- **Database schema (MongoDB, Mongoose sketches)**
  - User: { _id, companyId, workspaceId?, name, email, passwordHash, role, departmentId, isActive, lastLogin, metadata }
  - Company: { _id, name, subdomain, subscriptionPlan, subscriptionStatus, adminUserId, settings }
  - Department: { _id, companyId, name, description, managerId }
  - Task: { _id, companyId, title, description, assignedTo, status, priority, dueDate, createdAt }
  - Leave: { _id, companyId, employeeId, type, startDate, endDate, status, appliedAt }
  - Meeting: { _id, companyId, title, participants[], date, status }
  - AdminPanel (per workspace/company): { workspaceId, dashboard: { widgets }, permissions, quickActions }

- **Authentication & Authorization**
  - Use JWT access tokens (short expiry, e.g., 15m) and refresh tokens (longer expiry).
  - Protect routes with middleware that verifies JWT and loads `req.user`.
  - Company scoping: JWT should include `companyId` and `role`. Middleware enforces that queries filter by `companyId` automatically. For example, for `GET /api/tasks` the controller will always apply { companyId: req.user.companyId }.
  - Role-based checks for admin-only endpoints (e.g., company-level user management).

- **Data isolation strategy**
  - All collections that are company-specific must have `companyId` field with index.
  - Controllers will never return multi-company aggregates unless the caller is a platform super-admin.
  - Add request-level guard middleware `ensureCompanyScope` that injects `companyId` into query parameters if missing.

- **Integration steps with frontend**
  1. Start backend server on `http://localhost:5000` and set `API_CONFIG.BASE_URL` accordingly in frontend dev env.
  2. Implement auth endpoints and seed one company + admin user; verify login works from frontend.
  3. Implement `GET /api/analytics/overview` returning same fields used by `AnalyticsDashboard.tsx` and `pages/Admin/Analytics.tsx` (e.g., totalLeaves, leavesByStatus, topPerformers, timeseries arrays). Use the endpoint paths referenced in `src/services/analyticsService.ts`.
  4. Implement paginated `GET /api/departments` and `GET /api/users` and `GET /api/tasks/stats` to satisfy dashboard widgets.
  5. Iteratively wire frontend components to backend endpoints and verify charts/tables show real data.

- **Exact frontend -> backend endpoint mappings (used by frontend services)**
  - Auth
    - POST `/api/auth/login`  — login (body: { email, password, deviceInfo }) -> { success, user, device, tokens }
    - POST `/api/auth/refresh` — refresh tokens (body: { refreshToken, deviceId }) -> { tokens }
    - POST `/api/auth/logout` — logout (body: { logoutAll, deviceId })
    - GET `/api/auth/profile` — return current user profile

  - Analytics
    - GET `/api/analytics/overview` — returns { totalTasks, tasksByStatus, tasksByPriority, byDepartment[], topPerformers[], leavesByType, completionRate, avgTasksPerUser, usersCount, overdue, urgentTasks }
    - GET `/api/analytics/tasks/timeseries` — accepts query { groupBy=day|month, startDate, endDate } -> [{ date, total, completed }]
    - GET `/api/analytics/leaves/timeseries` — accepts date range -> [{ date, count }]

  - Users
    - GET `/api/users` — paginated list filtered by `companyId` from auth middleware
    - GET `/api/users/stats` — simple counts for dashboard widgets

  - Departments
    - GET `/api/departments` — list departments for company
    - GET `/api/departments/:id/employees` — list employees in department
    - GET `/api/departments/stats` — performance per department

  - Tasks
    - GET `/api/tasks` — list tasks filtered by company
    - GET `/api/tasks/stats` — aggregated stats for tasks

  - Leaves, Meetings
    - GET `/api/leaves` and `/api/leaves/stats`
    - GET `/api/meetings` and `/api/meetings/stats`

- **Frontend integration checklist**
  - Ensure `tiny-typer-tool-09/src/config/api.ts` has `BASE_URL` pointing to backend (`http://localhost:5000/api` in dev).
  - After auth login, frontend expects tokens and `user` stored in localStorage keys: `accessToken`, `refreshToken`, `user`, `device`, `deviceId`.
  - Analytics frontend expects `/analytics/overview` to provide `byDepartment`, `topPerformers`, and `tasksByStatus` shapes as described above.


- **Security & best practices**
  - Validate and sanitize all incoming parameters.
  - Rate-limit auth endpoints.
  - Use HTTPS in production and store secrets in env variables.
  - Log audit events for admin actions.

- **Development plan & milestones**
  - Week 1: Project scaffolding, auth, user model, company model, DB connection, seeders.
  - Week 2: Implement core APIs (users, departments, tasks, leaves), middleware for company scoping.
  - Week 3: Implement analytics endpoints and hooks; integrate with frontend charts.
  - Week 4: Platform SaaS endpoints, testing, docs, deployment scripts.

- **Deliverables**
  - `backend/` Express app with routes, models, middleware.
  - `backend/ROADMAP.md` (this file).
  - Sample seed data and instructions in `backend/README.md`.
