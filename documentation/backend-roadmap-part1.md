# Backend Roadmap for Tiny Typer Tool - Part 1: Foundation and Data Models

## 1. Project Overview

This document outlines the backend architecture for the "Tiny Typer Tool," a comprehensive Human Resource Management (HRM) system. The frontend analysis reveals a role-based application with distinct dashboards and functionalities for various user roles, including Super Admin, Department Head, Manager, HR, HR Manager, and Member.

The backend will be responsible for:
- User authentication and authorization.
- Data management for all modules (Users, Departments, Tasks, etc.).
- Business logic for HRM processes (e.g., leave approval, attendance tracking).
- Serving data to the frontend via a RESTful API.

## 2. Recommended Technology Stack

- **Runtime Environment:** Node.js
- **Framework:** Express.js (or a modern framework like NestJS for better structure and scalability)
- **Database:** MongoDB (a NoSQL database that offers flexibility for evolving schemas)
- **ODM (Object Data Modeling):** Mongoose (for modeling and managing data in MongoDB)
- **Authentication:** JSON Web Tokens (JWT)
- **Password Hashing:** bcrypt.js
- **Validation:** Joi or express-validator

## 3. Database Schema (Mongoose Models)

Here are the detailed Mongoose schemas for the core collections.

### User Model (`models/User.ts`)

Manages all users in the system and their roles.

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: 'super_admin' | 'department_head' | 'manager' | 'member' | 'hr' | 'hr_manager';
  department?: Schema.Types.ObjectId;
  manager?: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['super_admin', 'department_head', 'manager', 'member', 'hr', 'hr_manager'], 
    required: true 
  },
  department: { type: Schema.Types.ObjectId, ref: 'Department' },
  manager: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export default mongoose.model<IUser>('User', UserSchema);
```

### Department Model (`models/Department.ts`)

Manages organizational departments.

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface IDepartment extends Document {
  name: string;
  departmentHead?: Schema.Types.ObjectId; // Ref to User
  members: Schema.Types.ObjectId[]; // Array of refs to User
}

const DepartmentSchema: Schema = new Schema({
  name: { type: String, required: true, unique: true },
  departmentHead: { type: Schema.Types.ObjectId, ref: 'User' },
  members: [{ type: Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

export default mongoose.model<IDepartment>('Department', DepartmentSchema);
```

### Task Model (`models/Task.ts`)

Manages tasks assigned to users.

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface ITask extends Document {
  title: string;
  description: string;
  assignedTo: Schema.Types.ObjectId; // Ref to User
  assignedBy: Schema.Types.ObjectId; // Ref to User
  dueDate: Date;
  status: 'pending' | 'in_progress' | 'completed';
}

const TaskSchema: Schema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  dueDate: { type: Date },
  status: { type: String, enum: ['pending', 'in_progress', 'completed'], default: 'pending' }
}, { timestamps: true });

export default mongoose.model<ITask>('Task', TaskSchema);
```

### Leave Model (`models/Leave.ts`)

Manages leave requests from employees.

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface ILeave extends Document {
  user: Schema.Types.ObjectId; // Ref to User
  startDate: Date;
  endDate: Date;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: Schema.Types.ObjectId; // Ref to User (Manager/HR)
}

const LeaveSchema: Schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export default mongoose.model<ILeave>('Leave', LeaveSchema);
```

### Attendance Model (`models/Attendance.ts`)

Tracks employee check-in and check-out times.

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface IAttendance extends Document {
  user: Schema.Types.ObjectId; // Ref to User
  date: Date;
  checkIn: Date;
  checkOut?: Date;
  status: 'present' | 'absent' | 'late';
}

const AttendanceSchema: Schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date },
  status: { type: String, enum: ['present', 'absent', 'late'], required: true }
});

export default mongoose.model<IAttendance>('Attendance', AttendanceSchema);
```

### Meeting Model (`models/Meeting.ts`)

Manages scheduled meetings.

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface IMeeting extends Document {
  title: string;
  startTime: Date;
  endTime: Date;
  organizer: Schema.Types.ObjectId; // Ref to User
  attendees: Schema.Types.ObjectId[]; // Array of refs to User
  location?: string;
}

const MeetingSchema: Schema = new Schema({
  title: { type: String, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  organizer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  attendees: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  location: { type: String }
}, { timestamps: true });

export default mongoose.model<IMeeting>('Meeting', MeetingSchema);
```

### Event Model (`models/Event.ts`)

Manages company-wide events or holidays.

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface IEvent extends Document {
  title: string;
  description?: string;
  date: Date;
  type: 'holiday' | 'company_event' | 'other';
}

const EventSchema: Schema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  date: { type: Date, required: true },
  type: { type: String, enum: ['holiday', 'company_event', 'other'], default: 'other' }
}, { timestamps: true });

export default mongoose.model<IEvent>('Event', EventSchema);
