# Admin Analytics Roadmap

This document outlines a full roadmap to build an Admin Analytics dashboard (frontend + backend) integrated with the existing NevoStack codebase. It covers goals, metrics, data model, backend endpoints, aggregation strategies, frontend pages and components, caching, access control, monitoring, and rollout plan.

## 1. Goals

- Provide administrators with actionable insights across users, leaves, attendance, tasks, meetings, and company-level KPIs.
- Support time-range filters, segmentation by department/team, export, and scheduled reports.
- Ensure performance for large datasets via aggregated endpoints, caching, and background jobs.

## 2. Key Metrics & Visualizations

- Leave analytics
  - Total leaves (by status) over time (line chart)
  - Leaves by type (donut/pie)
  - Top employees by leave days (bar)
  - Monthly leave trend and year-over-year comparison
  - Department-wise leave heatmap / table

- Attendance analytics
  - Daily check-ins vs expected (line)
  - Average late arrivals per department (bar)
  - Absent vs present counts (pie)

- Tasks & Productivity
  - Tasks completed vs assigned (line)
  - Average completion time by department (bar)
  - Pending tasks by priority

- Meetings
  - Scheduled vs completed meetings
  - Rooms / virtual platform usage

- Users & Growth
  - Active users (DAU/WAU/MAU)
  - New registrations & churn per period

- Exports & PDF snapshots for executive summaries

## 3. Data Model & Aggregations

- Use existing collections: `leaves`, `attendance`, `tasks`, `meetings`, `users`, `companies`, `departments`.
- Aggregation patterns:
  - Time series: group by date bucket (day/week/month) using `$group` and `$dateTrunc` (MongoDB 5+)
  - Group counts: `$group` by status/type/department
  - Top-k: `$sort` + `$limit`

Indexes:
- `leaves`: index `companyId, startDate, status`
- `attendance`: index `companyId, date, userId`

Design note: Avoid fetching raw documents; return aggregated payloads shaped for charts.

## 4. Backend API Endpoints

All endpoints under `/api/analytics`

- `GET /api/analytics/overview?start=&end=&companyId=`
  - Returns summary counts (total users, active users, total leaves, pending leaves, avg. task completion time)

- `GET /api/analytics/leaves?start=&end=&companyId=&groupBy=day|month&departmentId=`
  - Time-series of leaves by status and by type

- `GET /api/analytics/leaves/top?start=&end=&companyId=&limit=`
  - Top employees by leave days

- `GET /api/analytics/attendance?start=&end=&companyId=&groupBy=day|month` 
  - Attendance time series

- `GET /api/analytics/tasks?start=&end=&companyId=`
  - Tasks KPIs (completed, pending, avg completion days)

- `GET /api/analytics/export?type=pdf|csv&report=overview|leaves...` - generate/export reports

Implementation details:
- Use MongoDB aggregation pipelines in `backend/routes/analytics.js`.
- Add `analyticsService` to `backend/lib` to centralize aggregation logic.

## 5. Frontend Pages & Components

- New admin page: `src/pages/Admin/Analytics.tsx`
- Components:
  - `OverviewCards` — top-level metrics
  - `TimeSeriesChart` — reusable line chart component
  - `DonutChart` — for categorical distributions
  - `BarTable` — combined bar chart + table
  - `FiltersPanel` — date range, company, department, team, export
  - `ExportModal` — schedule and download reports

Tech choices:
- Charts: Recharts, Chart.js, or ApexCharts (pick one used by the project). Use responsive charts and accessible color palette.
- Prefetch data using React Query (`useQuery`) with caching and background updates.

## 6. UI/UX & Interactions

- Filters at the top (time range, company, department) with debounced updates.
- Clicking a chart segment drills into a detail table or opens a modal with raw records.
- Hover tooltips on charts and export button visible for PDF/CSV.

## 7. Performance & Caching

- Cache common queries in Redis with TTL (e.g., 1 hour) for expensive aggregations.
- For near-real-time needs, run scheduled aggregation jobs storing daily snapshots in `analytics_snapshots` collection.

## 8. Security & Access Control

- Only `admin` and `super_admin` roles can access analytics endpoints. Enforce via `requireRole(['admin','super_admin'])` middleware.
- Ensure `companyId` filters are validated against the requesting user's company.

## 9. Testing

- Unit tests for aggregation functions (mock DB). 
- Integration tests for analytics endpoints returning expected shapes.
- Frontend component tests for charts rendering with sample data.

## 10. Milestones & Timeline (suggested)

- Week 1: Backend aggregation endpoints for leaves and overview + unit tests
- Week 2: Frontend overview page + time-series charts + filter panel
- Week 3: Additional charts (attendance, tasks), drilldowns, export
- Week 4: Caching, scheduled snapshots, performance tuning, QA

## 11. Example Backend Aggregation (pseudo)

```js
// leaves by day
const pipeline = [
  { $match: { companyId: ObjectId(companyId), startDate: { $gte: start, $lte: end } } },
  { $group: { _id: { $dateTrunc: { date: '$startDate', unit: 'day' } }, total: { $sum: 1 }, byStatus: { $push: '$status' } } },
  { $sort: { '_id': 1 } }
];
```

## 12. Deliverables

- `backend/routes/analytics.js` with endpoints and tests
- `backend/lib/analyticsService.js` aggregation helpers
- `tiny-typer-tool-09/src/pages/Admin/Analytics.tsx` and components
- README docs and deployment notes

---

Tell me if you prefer a specific charting library (Recharts / Chart.js / ApexCharts) and I will scaffold the backend endpoints and frontend pages next. 


