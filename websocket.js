const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

let io;

const TASK_ROOM_PREFIX = 'task_';

const initializeWebSocket = (server) => {
  io = socketIo(server, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"]
    }
  });

  // Authentication middleware for WebSocket
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      console.log('🔐 WebSocket auth attempt:', {
        hasToken: !!token,
        tokenLength: token ? token.length : 0,
        tokenStart: token ? token.substring(0, 20) + '...' : 'none'
      });

      if (!token) {
        console.log('❌ No token provided');
        return next(new Error('No authentication token provided'));
      }

      const jwtSecret = process.env.JWT_ACCESS_SECRET || 'your-access-secret-key';
      console.log('🔑 Using JWT secret:', jwtSecret ? 'Set' : 'Not set');

      const decoded = jwt.verify(token, jwtSecret);
      console.log('✅ Token decoded:', { id: decoded.id, email: decoded.email });

      const user = await User.findById(decoded.id);

      if (!user) {
        console.log('❌ User not found:', decoded.id);
        return next(new Error('User not found'));
      }

      console.log('✅ User found:', { id: user._id, email: user.email, role: user.role });

      socket.userId = user._id.toString();
      socket.userRole = user.role;
      socket.companyId = user.companyId.toString();
      next();
    } catch (error) {
      console.error('❌ WebSocket auth error:', error.message);
      next(new Error(`Authentication error: ${error.message}`));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.userId}`);

    // Join user to their personal room
    socket.join(`user_${socket.userId}`);

    // Join user to company room
    socket.join(`company_${socket.companyId}`);

    socket.on('join_task_comments', (taskId) => {
      if (taskId) {
        socket.join(`${TASK_ROOM_PREFIX}${taskId}`);
      }
    });

    socket.on('leave_task_comments', (taskId) => {
      if (taskId) {
        socket.leave(`${TASK_ROOM_PREFIX}${taskId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 User disconnected: ${socket.userId}`);
    });

    // Handle notification subscription
    socket.on('subscribe_notifications', () => {
      console.log(`🔔 User ${socket.userId} subscribed to notifications`);
    });

    // Handle notification unsubscription
    socket.on('unsubscribe_notifications', () => {
      console.log(`🔔 User ${socket.userId} unsubscribed from notifications`);
    });
  });

  return io;
};

// Function to send notification to specific user
const sendNotificationToUser = (userId, notification) => {
  if (io) {
    io.to(`user_${userId}`).emit('new_notification', notification);
    console.log(`📤 Notification sent to user: ${userId}`);
  }
};

// Function to send notification to company
const sendNotificationToCompany = (companyId, notification) => {
  if (io) {
    io.to(`company_${companyId}`).emit('new_notification', notification);
    console.log(`📤 Notification sent to company: ${companyId}`);
  }
};

// Function to send unread count update
const sendUnreadCountUpdate = (userId, count) => {
  if (io) {
    io.to(`user_${userId}`).emit('unread_count_update', { count });
    console.log(`📊 Unread count update sent to user: ${userId}, count: ${count}`);
  }
};

const sendTaskCommentEvent = (taskId, payload) => {
  if (io && taskId) {
    io.to(`${TASK_ROOM_PREFIX}${taskId}`).emit('task_comment_event', payload);
  }
};

module.exports = {
  initializeWebSocket,
  sendNotificationToUser,
  sendNotificationToCompany,
  sendUnreadCountUpdate,
  sendTaskCommentEvent
};
