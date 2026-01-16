# Backend Roadmap for Tiny Typer Tool - Part 3: Notification System

## 1. Notification System Overview

The notification system is a critical component for keeping users informed about important events and actions within the application. It will be designed to be real-time, scalable, and flexible enough to handle various types of notifications.

Notifications will be triggered by specific events, such as:
- A new task is assigned.
- A leave request is approved or rejected.
- A meeting is scheduled or updated.
- A company-wide announcement is made.

## 2. Notification Schema

A new Mongoose model will be created to store notifications.

### Notification Model (`models/Notification.ts`)

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  user: Schema.Types.ObjectId; // The user who receives the notification
  message: string;
  type: 'task' | 'leave' | 'meeting' | 'event' | 'announcement';
  relatedId?: Schema.Types.ObjectId; // Optional ID to link to the related document (e.g., Task ID)
  isRead: boolean;
  createdAt: Date;
}

const NotificationSchema: Schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['task', 'leave', 'meeting', 'event', 'announcement'], 
    required: true 
  },
  relatedId: { type: Schema.Types.ObjectId },
  isRead: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model<INotification>('Notification', NotificationSchema);
```

## 3. Notification Delivery Mechanisms

We can implement a combination of real-time and passive notification methods.

### a) Real-Time Notifications (WebSockets)

For instant delivery, WebSockets are the ideal solution.

- **Technology:** `Socket.IO` or `ws` library.
- **Implementation:**
  1. Set up a WebSocket server that listens for connections from authenticated users.
  2. When a notification-triggering event occurs (e.g., a task is created), the server will save the notification to the database and then emit a `new_notification` event to the specific user's WebSocket connection.
  3. The frontend client will listen for this event and display a real-time alert (e.g., a toast message or an updated notification count in the header).

### b) In-App Notification Center

This will be a dedicated section in the UI where users can view a history of their notifications.

- **API Endpoints:**
  - `GET /api/v1/notifications`: Get all notifications for the authenticated user (with pagination).
  - `POST /api/v1/notifications/mark-as-read`: Mark all unread notifications as read.
  - `PUT /api/v1/notifications/:id/read`: Mark a specific notification as read.

### c) Email Notifications (Optional)

For critical alerts or for users who are not currently active, email notifications can be a valuable addition.

- **Technology:** `Nodemailer` with an email service provider like SendGrid or Mailgun.
- **Implementation:**
  1. Create email templates for different notification types.
  2. When a critical event occurs, a job can be added to a queue (e.g., using `BullMQ`) to send an email to the user. Using a queue prevents blocking the main application thread.

## 4. Workflow Example: New Task Assignment

1. A manager assigns a new task to a team member via the frontend.
2. The backend receives the request at the `POST /api/v1/tasks` endpoint.
3. The task is created and saved to the database.
4. A new notification document is created with the message "You have been assigned a new task: [Task Title]".
5. The notification is saved to the `Notifications` collection.
6. The WebSocket server emits a `new_notification` event to the assigned user's client with the notification payload.
7. The user's frontend receives the event and displays a real-time alert.
