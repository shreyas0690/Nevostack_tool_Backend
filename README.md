Quick start for the sample Reports backend

1. cd backend
2. npm install
3. npm start

APIs:
- GET /api/reports
- GET /api/reports/:id
- POST /api/reports/export

This is a minimal scaffold for local testing and frontend integration.

# 🚀 NevoStack HRMS Backend API

एक comprehensive Node.js/Express.js backend API जो complete HR Management System के लिए बनी है।

## ✨ Features

- **🔐 JWT Authentication** - Access और refresh tokens के साथ secure authentication
- **📱 Device Tracking** - User devices की monitoring और management
- **👥 Role-Based Access Control** - Multiple user roles के साथ hierarchical access
- **📊 Complete CRUD Operations** - सभी modules के लिए complete API endpoints
- **🔒 Advanced Security** - Rate limiting, validation, और CORS protection
- **📈 Business Modules** - Attendance, Leave, Tasks, Meetings, Notifications

## 🛠️ Setup Instructions

### 1. Prerequisites
```bash
# Node.js (v18+) और MongoDB installed होना चाहिए
node --version
mongod --version
```

### 2. Installation
```bash
# Backend folder में जाएं
cd backend

# Dependencies install करें
npm install

# Environment file setup करें
copy .env.example .env    # Windows
cp .env.example .env      # Linux/Mac

# .env file को configure करें (देखें Environment Configuration section)
```

### 3. Database Setup
```bash
# MongoDB start करें (अगर service नहीं चल रही)
# Windows: MongoDB service start करें
# Linux/Mac: mongod command चलाएं

# Sample data add करें (optional)
npm run seed
```

### 4. Start the Server
```bash
# Development mode में start करें
npm run dev

# Production mode में start करें
npm start
```

## ⚙️ Environment Configuration

`.env` file में ये settings configure करें:

```env
# Server Configuration
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# Database
MONGODB_URI=mongodb://localhost:27017/nevostack_hrms

# JWT Secrets (Strong secrets use करें production में)
JWT_ACCESS_SECRET=your_super_secret_access_key_here
JWT_REFRESH_SECRET=your_super_secret_refresh_key_here
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 🔐 Default Login Credentials

Database seed करने के बाद ये credentials use कर सकते हैं:

| Role | Email | Password | Description |
|------|-------|----------|-------------|
| Super Admin | admin@nevostack.com | password123 | Complete system access |
| Company Admin | company@nevostack.com | password123 | Company management |
| HR Manager | hrmanager@nevostack.com | password123 | HR operations |
| HOD | hod.engineering@nevostack.com | password123 | Department head |
| Manager | manager@nevostack.com | password123 | Team management |
| HR | hr@nevostack.com | password123 | HR specialist |
| Developer | dev1@nevostack.com | password123 | Regular employee |

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/profile` - Get user profile
- `POST /api/auth/change-password` - Change password

### Users Management
- `GET /api/users` - Get all users (with pagination)
- `POST /api/users` - Create new user
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `GET /api/users/stats` - Get user statistics

### Device Management
- `GET /api/devices` - Get user devices
- `PATCH /api/devices` - Device actions (trust, lock)
- `DELETE /api/devices` - Delete device
- `POST /api/devices/activity` - Record device activity
- `GET /api/devices/activity` - Get device activity

### Tasks Management
- `GET /api/tasks` - Get tasks
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `PATCH /api/tasks/:id/status` - Update task status

### Attendance Management
- `GET /api/attendance` - Get attendance records
- `POST /api/attendance/check-in` - Check in
- `POST /api/attendance/check-out` - Check out
- `GET /api/attendance/stats` - Get attendance statistics

### Leave Management
- `GET /api/leaves` - Get leave requests
- `POST /api/leaves` - Create leave request
- `PATCH /api/leaves/:id/approve` - Approve leave
- `PATCH /api/leaves/:id/reject` - Reject leave

### Meetings Management
- `GET /api/meetings` - Get meetings
- `POST /api/meetings` - Create meeting
- `PUT /api/meetings/:id` - Update meeting
- `DELETE /api/meetings/:id` - Delete meeting

### Departments Management
- `GET /api/departments` - Get departments
- `POST /api/departments` - Create department
- `PUT /api/departments/:id` - Update department
- `GET /api/departments/:id/employees` - Get department employees

### Companies Management (Super Admin only)
- `GET /api/companies` - Get companies
- `POST /api/companies` - Create company
- `PUT /api/companies/:id` - Update company
- `GET /api/companies/stats` - Get company statistics

### Notifications
- `GET /api/notifications` - Get notifications
- `POST /api/notifications` - Create notification
- `PATCH /api/notifications/:id/read` - Mark as read

## 🏗️ Project Structure

```
backend/
├── models/                 # Database models
│   ├── User.js            # User model
│   ├── Device.js          # Device tracking
│   ├── Company.js         # Company management
│   ├── Department.js      # Department structure
│   ├── Task.js            # Task management
│   ├── Attendance.js      # Attendance tracking
│   ├── Leave.js           # Leave management
│   ├── Meeting.js         # Meeting scheduler
│   ├── Notification.js    # Notifications
│   └── index.js           # Models export
├── routes/                # API routes
│   ├── auth.js            # Authentication
│   ├── users.js           # User management
│   ├── devices.js         # Device management
│   ├── tasks.js           # Task management
│   ├── attendance.js      # Attendance
│   ├── leaves.js          # Leave management
│   ├── meetings.js        # Meetings
│   ├── departments.js     # Departments
│   ├── companies.js       # Companies
│   └── notifications.js   # Notifications
├── middleware/            # Express middleware
│   ├── auth.js            # Authentication middleware
│   └── errorHandler.js    # Error handling
├── lib/                   # Utilities
│   └── mongodb.js         # Database connection
├── scripts/               # Utility scripts
│   └── seed.js            # Database seeding
├── server.js              # Main server file
├── package.json           # Dependencies
└── README.md              # This file
```

## 👥 User Roles & Permissions

### Role Hierarchy
```
Super Admin
├── Admin (Company Admin)
├── HR Manager
└── HOD (Head of Department)
    └── Manager
        └── Member
```

### Permission Matrix
| Feature | Super Admin | Admin | HR Manager | HOD | Manager | Member |
|---------|-------------|-------|------------|-----|---------|--------|
| User Management | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Company Management | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Department Management | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Task Assignment | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Attendance Management | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Leave Management | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Analytics Access | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

## 🔒 Security Features

- **JWT Authentication** with access और refresh tokens
- **Device Tracking** for security monitoring
- **Rate Limiting** API abuse को prevent करने के लिए
- **Input Validation** malicious input को block करने के लिए
- **CORS Protection** cross-origin attacks से बचने के लिए
- **Password Hashing** bcrypt के साथ secure password storage
- **Account Lockout** multiple failed attempts के बाद account lock

## 🚀 API Testing

### Health Check
```bash
curl http://localhost:5000/health
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@nevostack.com",
    "password": "password123"
  }'
```

### Get Users (with token)
```bash
curl http://localhost:5000/api/users \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 🐛 Troubleshooting

### Common Issues

#### MongoDB Connection Error
```bash
# MongoDB service check करें
mongod --version

# MongoDB start करें
# Windows: MongoDB service start करें
# Linux: sudo systemctl start mongod
```

#### Port Already in Use
```bash
# Port 5000 को use कर रहे process को find करें
netstat -ano | findstr :5000     # Windows
lsof -i :5000                    # Linux/Mac

# Process को kill करें
taskkill /PID <PID> /F           # Windows
kill -9 <PID>                    # Linux/Mac
```

#### Module Not Found Errors
```bash
# Node modules reinstall करें
rm -rf node_modules package-lock.json
npm install
```

## 📊 Available Scripts

```bash
npm start          # Production server start करें
npm run dev        # Development server start करें (nodemon के साथ)
npm run seed       # Database में sample data add करें
npm run setup      # Complete setup (install + seed)
```

## 🎯 Quick Start Commands

```bash
# Complete setup एक command में
cd backend
npm run setup

# Manual setup
npm install
npm run seed
npm run dev
```

## 📞 Support & Help

अगर कोई issue आए तो:

1. **Logs check करें**: Console में error messages देखें
2. **Environment variables verify करें**: `.env` file properly configured हो
3. **Database connection test करें**: MongoDB running हो
4. **Port conflicts check करें**: Port 5000 free हो

## ✅ Success Indicators

अगर सब कुछ सही है तो आपको ये दिखना चाहिए:

```
✅ MongoDB connected successfully
🚀 Server running on port 5000
📊 Environment: development
🔗 Health check: http://localhost:5000/health
```

**आपका NevoStack HRMS Backend अब तैयार है! 🎉**

---

*Happy Coding! Your professional HR Management System backend is now ready for use.*