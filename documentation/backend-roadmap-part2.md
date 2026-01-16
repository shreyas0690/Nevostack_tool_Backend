# Backend Roadmap for Tiny Typer Tool - Part 2: API and Endpoints

## 1. API Structure Overview

The API will be designed following RESTful principles. All endpoints will be versioned (e.g., `/api/v1/...`) to ensure future compatibility.

### Authentication
- A token-based authentication system using JWT will be implemented.
- The `/api/v1/auth/login` endpoint will return a JWT upon successful login.
- This token must be included in the `Authorization` header for all protected routes.

### Middleware
- **Authentication Middleware:** Verifies the JWT and attaches the user object to the request.
- **Authorization Middleware:** Checks if the authenticated user has the required role to access a specific endpoint.
- **Validation Middleware:** Validates incoming request bodies against predefined schemas.
- **Error Handling Middleware:** A centralized handler for catching and formatting errors.

## 2. API Endpoints

### Authentication (`/api/v1/auth`)
- `POST /register`: Register a new user (potentially restricted to Super Admin).
- `POST /login`: Authenticate a user and return a JWT.
- `POST /change-password`: Allow a logged-in user to change their password.
- `GET /profile`: Get the profile of the currently authenticated user.

### Users (`/api/v1/users`)
- `GET /`: Get a list of all users (with pagination and filtering).
- `GET /:id`: Get a single user by ID.
- `POST /`: Create a new user.
- `PUT /:id`: Update a user's details.
- `DELETE /:id`: Delete a user.

### Departments (`/api/v1/departments`)
- `GET /`: Get all departments.
- `GET /:id`: Get a single department by ID, populating `departmentHead` and `members`.
- `POST /`: Create a new department.
- `PUT /:id`: Update a department.
- `DELETE /:id`: Delete a department.
- `POST /:id/members`: Add a member to a department.
- `DELETE /:id/members/:memberId`: Remove a member from a department.

### Tasks (`/api/v1/tasks`)
- `GET /`: Get all tasks (with filters for `assignedTo`, `status`, etc.).
- `GET /:id`: Get a single task by ID.
- `POST /`: Create a new task.
- `PUT /:id`: Update a task (e.g., change status).
- `DELETE /:id`: Delete a task.

### Leave (`/api/v1/leave`)
- `GET /`: Get all leave requests (role-dependent filtering).
- `GET /user/:userId`: Get all leave requests for a specific user.
- `POST /`: Submit a new leave request.
- `PUT /:id/status`: Update the status of a leave request (approve/reject).

### Attendance (`/api/v1/attendance`)
- `GET /`: Get attendance records (with date and user filters).
- `POST /check-in`: Record a user's check-in time.
- `POST /check-out`: Record a user's check-out time.

### Meetings (`/api/v1/meetings`)
- `GET /`: Get all meetings.
- `POST /`: Schedule a new meeting.
- `PUT /:id`: Update a meeting.
- `DELETE /:id`: Cancel a meeting.

### Events (`/api/v1/events`)
- `GET /`: Get all events.
- `POST /`: Create a new event.
- `PUT /:id`: Update an event.
- `DELETE /:id`: Delete an event.

## 3. Next Steps

With the database and API structure defined, the next phase is implementation. This involves:
1. Setting up the Node.js/Express project structure.
2. Implementing the Mongoose models.
3. Creating the authentication and authorization middleware.
4. Building out the API routes and controllers for each module.
5. Thoroughly testing each endpoint.
