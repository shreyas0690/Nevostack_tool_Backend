# Manager Dashboard API Documentation

This document describes the API endpoints for the Manager Dashboard functionality, which allows managers to view and manage their team's tasks, including urgent and overdue tasks.

## Base URL
All endpoints are prefixed with `/api/manager`

## Authentication
All endpoints require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### 1. Dashboard Overview
**GET** `/api/manager/dashboard`

Returns a comprehensive overview of the manager's team dashboard including team statistics, urgent tasks, overdue tasks, and recent activity.

#### Response
```json
{
  "success": true,
  "data": {
    "teamMembers": 5,
    "teamTasks": 12,
    "completionRate": 75,
    "urgent": {
      "count": 3,
      "tasks": [
        {
          "_id": "task_id",
          "title": "Urgent Bug Fix",
          "description": "Fix critical production bug",
          "priority": "urgent",
          "status": "in_progress",
          "dueDate": "2024-01-15T10:00:00.000Z",
          "assignedTo": {
            "_id": "user_id",
            "firstName": "John",
            "lastName": "Doe",
            "email": "john@company.com",
            "role": "member",
            "position": "Developer"
          },
          "assignedBy": {
            "_id": "manager_id",
            "firstName": "Jane",
            "lastName": "Manager",
            "email": "jane@company.com",
            "role": "manager"
          },
          "companyId": {
            "_id": "company_id",
            "name": "Company Name"
          },
          "departmentId": {
            "_id": "dept_id",
            "name": "Engineering"
          }
        }
      ]
    },
    "overdue": {
      "count": 2,
      "tasks": [
        {
          "_id": "task_id",
          "title": "Overdue Feature",
          "description": "Implement new feature",
          "priority": "high",
          "status": "assigned",
          "dueDate": "2024-01-10T10:00:00.000Z",
          "assignedTo": {
            "_id": "user_id",
            "firstName": "Alice",
            "lastName": "Smith",
            "email": "alice@company.com",
            "role": "member",
            "position": "Designer"
          }
        }
      ]
    },
    "recentTasks": [
      {
        "_id": "task_id",
        "title": "Recent Task",
        "description": "Task created recently",
        "priority": "medium",
        "status": "assigned",
        "createdAt": "2024-01-12T10:00:00.000Z"
      }
    ]
  }
}
```

### 2. Team Members
**GET** `/api/manager/team-members`

Returns a detailed list of team members with their individual task statistics.

#### Response
```json
{
  "success": true,
  "data": {
    "teamMembers": [
      {
        "_id": "user_id",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@company.com",
        "role": "member",
        "position": "Developer",
        "departmentId": {
          "_id": "dept_id",
          "name": "Engineering"
        },
        "dateOfJoining": "2023-01-15T00:00:00.000Z",
        "taskStats": {
          "total": 8,
          "completed": 6,
          "inProgress": 2,
          "urgent": 1,
          "overdue": 0,
          "completionRate": 75
        }
      }
    ],
    "totalMembers": 1
  }
}
```

### 3. Urgent Tasks
**GET** `/api/manager/urgent-tasks`

Returns all urgent tasks for team members with pagination support.

#### Query Parameters
- `page` (optional): Page number (default: 1)
- `limit` (optional): Number of tasks per page (default: 20)

#### Example Request
```
GET /api/manager/urgent-tasks?page=1&limit=10
```

#### Response
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "_id": "task_id",
        "title": "Urgent Bug Fix",
        "description": "Fix critical production bug",
        "priority": "urgent",
        "status": "in_progress",
        "dueDate": "2024-01-15T10:00:00.000Z",
        "assignedTo": {
          "_id": "user_id",
          "firstName": "John",
          "lastName": "Doe",
          "email": "john@company.com",
          "role": "member",
          "position": "Developer"
        }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalTasks": 3,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

### 4. Overdue Tasks
**GET** `/api/manager/overdue-tasks`

Returns all overdue tasks for team members with pagination support.

#### Query Parameters
- `page` (optional): Page number (default: 1)
- `limit` (optional): Number of tasks per page (default: 20)

#### Example Request
```
GET /api/manager/overdue-tasks?page=1&limit=10
```

#### Response
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "_id": "task_id",
        "title": "Overdue Feature",
        "description": "Implement new feature",
        "priority": "high",
        "status": "assigned",
        "dueDate": "2024-01-10T10:00:00.000Z",
        "assignedTo": {
          "_id": "user_id",
          "firstName": "Alice",
          "lastName": "Smith",
          "email": "alice@company.com",
          "role": "member",
          "position": "Designer"
        }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalTasks": 2,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

### 5. Team Performance
**GET** `/api/manager/team-performance`

Returns comprehensive team performance metrics and statistics.

#### Query Parameters
- `period` (optional): Analysis period in days (default: 30)

#### Example Request
```
GET /api/manager/team-performance?period=30
```

#### Response
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalTasks": 25,
      "completedTasks": 18,
      "inProgressTasks": 5,
      "completionRate": 72,
      "recentTasks": 8,
      "avgCompletionDays": 5
    },
    "priorityDistribution": {
      "urgent": 3,
      "high": 5,
      "medium": 12,
      "low": 5
    },
    "statusDistribution": {
      "completed": 18,
      "in_progress": 3,
      "assigned": 2,
      "review": 1,
      "blocked": 1
    },
    "period": 30
  }
}
```

### 6. Member Tasks
**GET** `/api/manager/member-tasks/:memberId`

Returns tasks for a specific team member with filtering and pagination support.

#### Path Parameters
- `memberId`: The ID of the team member

#### Query Parameters
- `status` (optional): Filter by task status
- `priority` (optional): Filter by task priority
- `page` (optional): Page number (default: 1)
- `limit` (optional): Number of tasks per page (default: 20)

#### Example Request
```
GET /api/manager/member-tasks/60f7b3b3b3b3b3b3b3b3b3b3?status=in_progress&priority=urgent&page=1&limit=10
```

#### Response
```json
{
  "success": true,
  "data": {
    "member": {
      "_id": "user_id",
      "name": "John Doe",
      "email": "john@company.com",
      "role": "member",
      "position": "Developer"
    },
    "tasks": [
      {
        "_id": "task_id",
        "title": "Task Title",
        "description": "Task description",
        "priority": "urgent",
        "status": "in_progress",
        "dueDate": "2024-01-15T10:00:00.000Z",
        "assignedTo": {
          "_id": "user_id",
          "firstName": "John",
          "lastName": "Doe",
          "email": "john@company.com",
          "role": "member",
          "position": "Developer"
        }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalTasks": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

## Error Responses

All endpoints may return the following error responses:

### 401 Unauthorized
```json
{
  "error": "Access denied",
  "message": "Invalid or missing token"
}
```

### 403 Forbidden
```json
{
  "error": "Access denied",
  "message": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "error": "Team member not found or not under your management"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to load dashboard"
}
```

## Usage Examples

### Frontend Integration

```javascript
// Get dashboard overview
const getDashboard = async () => {
  const response = await fetch('/api/manager/dashboard', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return response.json();
};

// Get urgent tasks with pagination
const getUrgentTasks = async (page = 1, limit = 10) => {
  const response = await fetch(`/api/manager/urgent-tasks?page=${page}&limit=${limit}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return response.json();
};

// Get team performance for last 7 days
const getTeamPerformance = async () => {
  const response = await fetch('/api/manager/team-performance?period=7', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return response.json();
};
```

## Notes

1. **Access Control**: All endpoints are restricted to users with roles: `manager`, `department_head`, `admin`, or `super_admin`.

2. **Company Isolation**: All data is filtered by the user's company to ensure proper data isolation.

3. **Team Member Scope**: Tasks and statistics include both the manager's own tasks and tasks assigned to their direct reports.

4. **Pagination**: Endpoints that return lists support pagination to handle large datasets efficiently.

5. **Real-time Data**: All endpoints return current data from the database. For real-time updates, consider implementing WebSocket connections or polling mechanisms.

6. **Performance**: The endpoints are optimized with proper database indexing and aggregation pipelines for efficient querying.





