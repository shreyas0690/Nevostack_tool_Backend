import { Document, Types } from 'mongoose'

// Base interface for all documents
export interface BaseDocument extends Document {
  _id: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

// User-related types
export interface IUser extends BaseDocument {
  username: string
  email: string
  password: string
  firstName: string
  lastName: string
  role: UserRole
  department?: Types.ObjectId
  manager?: Types.ObjectId
  phone?: string
  avatar?: string
  dateOfJoining: Date
  status: UserStatus
  position?: string
  salary?: number
  permissions: string[]
  lastLogin?: Date
  resetPasswordToken?: string
  resetPasswordExpires?: Date
  isEmailVerified: boolean
  emailVerificationToken?: string
}

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  HR = 'hr',
  HR_MANAGER = 'hr_manager',
  HOD = 'hod',
  MANAGER = 'manager',
  MEMBER = 'member'
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  TERMINATED = 'terminated'
}

// Department-related types
export interface IDepartment extends BaseDocument {
  name: string
  description?: string
  hod: Types.ObjectId
  managers: Types.ObjectId[]
  members: Types.ObjectId[]
  budget?: number
  status: DepartmentStatus
  parentDepartment?: Types.ObjectId
  subDepartments: Types.ObjectId[]
}

export enum DepartmentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive'
}

// Attendance-related types
export interface IAttendance extends BaseDocument {
  user: Types.ObjectId
  date: Date
  checkIn?: Date
  checkOut?: Date
  breakStart?: Date
  breakEnd?: Date
  totalHours?: number
  status: AttendanceStatus
  notes?: string
  location?: {
    latitude: number
    longitude: number
    address?: string
  }
  ipAddress?: string
}

export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  LATE = 'late',
  HALF_DAY = 'half_day',
  HOLIDAY = 'holiday',
  WEEKEND = 'weekend'
}

// Leave-related types
export interface ILeave extends BaseDocument {
  user: Types.ObjectId
  leaveType: LeaveType
  startDate: Date
  endDate: Date
  totalDays: number
  reason: string
  status: LeaveStatus
  appliedDate: Date
  approvedBy?: Types.ObjectId
  approvedDate?: Date
  rejectedReason?: string
  documents?: string[]
}

export enum LeaveType {
  SICK = 'sick',
  VACATION = 'vacation',
  PERSONAL = 'personal',
  MATERNITY = 'maternity',
  PATERNITY = 'paternity',
  EMERGENCY = 'emergency',
  UNPAID = 'unpaid'
}

export enum LeaveStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled'
}

// Leave Balance types
export interface ILeaveBalance extends BaseDocument {
  user: Types.ObjectId
  year: number
  leaveType: LeaveType
  allocated: number
  used: number
  remaining: number
}

// Meeting-related types
export interface IMeeting extends BaseDocument {
  title: string
  description?: string
  organizer: Types.ObjectId
  attendees: Types.ObjectId[]
  startTime: Date
  endTime: Date
  location?: string
  type: MeetingType
  status: MeetingStatus
  agenda?: string[]
  notes?: string
  recordingUrl?: string
  documents?: string[]
}

export enum MeetingType {
  ONE_ON_ONE = 'one_on_one',
  TEAM = 'team',
  DEPARTMENT = 'department',
  ALL_HANDS = 'all_hands',
  CLIENT = 'client',
  INTERVIEW = 'interview'
}

export enum MeetingStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  RESCHEDULED = 'rescheduled'
}

// Task-related types
export interface ITask extends BaseDocument {
  title: string
  description?: string
  assignedTo: Types.ObjectId[]
  assignedBy: Types.ObjectId
  department?: Types.ObjectId
  project?: Types.ObjectId
  startDate?: Date
  dueDate?: Date
  priority: TaskPriority
  status: TaskStatus
  progress: number
  tags?: string[]
  attachments?: string[]
  comments: ITaskComment[]
  estimatedHours?: number
  actualHours?: number
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export interface ITaskComment {
  user: Types.ObjectId
  comment: string
  createdAt: Date
}

// Project-related types
export interface IProject extends BaseDocument {
  name: string
  description?: string
  manager: Types.ObjectId
  team: Types.ObjectId[]
  department: Types.ObjectId
  startDate: Date
  endDate?: Date
  status: ProjectStatus
  budget?: number
  progress: number
  tasks: Types.ObjectId[]
}

export enum ProjectStatus {
  PLANNING = 'planning',
  IN_PROGRESS = 'in_progress',
  ON_HOLD = 'on_hold',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

// Event-related types
export interface IEvent extends BaseDocument {
  title: string
  description?: string
  organizer: Types.ObjectId
  startDate: Date
  endDate: Date
  location?: string
  type: EventType
  attendees?: Types.ObjectId[]
  isAllDay: boolean
  isRecurring: boolean
  recurringPattern?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
    interval: number
    endDate?: Date
  }
}

export enum EventType {
  COMPANY = 'company',
  DEPARTMENT = 'department',
  TEAM = 'team',
  HOLIDAY = 'holiday',
  TRAINING = 'training',
  SOCIAL = 'social'
}

// Notification-related types
export interface INotification extends BaseDocument {
  user: Types.ObjectId
  title: string
  message: string
  type: NotificationType
  isRead: boolean
  data?: any
  actionUrl?: string
}

export enum NotificationType {
  LEAVE_REQUEST = 'leave_request',
  LEAVE_APPROVED = 'leave_approved',
  LEAVE_REJECTED = 'leave_rejected',
  MEETING_SCHEDULED = 'meeting_scheduled',
  MEETING_CANCELLED = 'meeting_cancelled',
  TASK_ASSIGNED = 'task_assigned',
  TASK_COMPLETED = 'task_completed',
  SYSTEM = 'system',
  REMINDER = 'reminder'
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean
  message: string
  data?: T
  error?: string
  errors?: { [key: string]: string }
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

// Authentication types
export interface LoginCredentials {
  email: string
  password: string
}

export interface TokenPayload {
  userId: string
  email: string
  role: UserRole
  iat?: number
  exp?: number
}

export interface AuthRequest extends Request {
  user?: TokenPayload
}

// Filter and query types
export interface BaseFilter {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  search?: string
  startDate?: Date
  endDate?: Date
}

export interface UserFilter extends BaseFilter {
  role?: UserRole
  status?: UserStatus
  department?: string
}

export interface AttendanceFilter extends BaseFilter {
  user?: string
  status?: AttendanceStatus
  department?: string
}

export interface LeaveFilter extends BaseFilter {
  user?: string
  status?: LeaveStatus
  leaveType?: LeaveType
}

export interface TaskFilter extends BaseFilter {
  assignedTo?: string
  status?: TaskStatus
  priority?: TaskPriority
  department?: string
  project?: string
}



