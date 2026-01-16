const AuditService = require('../services/auditService');

// Middleware to automatically log actions
const auditLogger = (action, options = {}) => {
  return async (req, res, next) => {
    const startTime = Date.now();

    // Store original response methods
    const originalSend = res.send;
    const originalJson = res.json;
    const originalStatus = res.status;

    // Override response methods to capture response data
    let responseData = null;
    let responseStatus = 200;

    res.send = function(data) {
      responseData = data;
      return originalSend.call(this, data);
    };

    res.json = function(data) {
      responseData = data;
      return originalJson.call(this, data);
    };

    res.status = function(code) {
      responseStatus = code;
      return originalStatus.call(this, code);
    };

    // After response is sent
    res.on('finish', async () => {
      try {
        const userId = req.user ? req.user.id : null;
        const companyId = req.user ? req.user.companyId : null;

        // Extract request information
        const ipAddress = req.ip || req.connection.remoteAddress ||
                         (req.socket && req.socket.remoteAddress) ||
                         (req.connection.socket && req.connection.socket.remoteAddress) || '';

        const userAgent = req.get('User-Agent') || '';
        const device = getDeviceFromUserAgent(userAgent);
        const location = getLocationFromIP(ipAddress);

        // Determine action status based on response
        const status = responseStatus >= 200 && responseStatus < 300 ? 'success' : 'failed';

        // Build metadata
        const metadata = {
          resourceId: options.resourceId || getResourceIdFromRequest(req),
          resourceType: options.resourceType || getResourceTypeFromAction(action),
          oldValue: options.oldValue,
          newValue: options.newValue,
          reason: options.reason,
          additionalData: {
            method: req.method,
            url: req.originalUrl,
            responseStatus,
            duration: Date.now() - startTime,
            userAgent,
            ...options.additionalData
          }
        };

        // Get description
        const description = options.description || generateDescription(action, req, responseData);

        // Skip logging for certain actions or in development for certain requests
        if (shouldSkipLogging(action, req)) {
          return;
        }

        // Prepare user information from request
        const userInfo = req.user ? {
          userEmail: req.user.email,
          userName: req.user.firstName && req.user.lastName ?
                   `${req.user.firstName} ${req.user.lastName}` :
                   (req.user.firstName || req.user.lastName || req.user.email),
          userRole: req.user.role,
          companyId: req.user.companyId,
          companyName: options.companyName // Will be fetched by service if not provided
        } : {};

        // Create audit log
        await AuditService.createAuditLogWithUser(userId, action, description, {
          ...userInfo,
          category: options.category,
          severity: options.severity,
          ipAddress,
          userAgent,
          device,
          location,
          metadata,
          status,
          sessionId: req.sessionId,
          requestId: req.requestId
        });

      } catch (error) {
        console.error('❌ Audit logging error:', error);
        // Don't throw error to prevent audit logging from breaking main functionality
      }
    });

    next();
  };
};

// Helper functions
function getDeviceFromUserAgent(userAgent) {
  if (!userAgent) return 'Unknown';

  if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
    return 'Mobile';
  } else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
    return 'Tablet';
  } else {
    return 'Desktop';
  }
}

function getLocationFromIP(ipAddress) {
  // In a real application, you would use a GeoIP service
  // For now, return a placeholder
  return 'Unknown Location';
}

function getResourceIdFromRequest(req) {
  // Extract resource ID from URL parameters
  const { id, userId, companyId, taskId, meetingId, leaveId } = req.params;
  return id || userId || companyId || taskId || meetingId || leaveId || null;
}

function getResourceTypeFromAction(action) {
  const actionResourceMap = {
    'user_created': 'user',
    'user_updated': 'user',
    'user_deleted': 'user',
    'company_created': 'company',
    'company_updated': 'company',
    'company_deleted': 'company',
    'task_created': 'task',
    'task_updated': 'task',
    'task_deleted': 'task',
    'meeting_created': 'meeting',
    'meeting_updated': 'meeting',
    'meeting_deleted': 'meeting',
    'leave_requested': 'leave',
    'leave_approved': 'leave',
    'leave_rejected': 'leave',
    'subscription_created': 'subscription',
    'subscription_updated': 'subscription',
    'payment_processed': 'payment'
  };

  return actionResourceMap[action] || null;
}

function generateDescription(action, req, responseData) {
  const actionDescriptions = {
    'user_created': 'Created new user account',
    'user_updated': 'Updated user information',
    'user_deleted': 'Deleted user account',
    'user_status_changed': 'Changed user account status',
    'user_login': 'User logged into the system',
    'user_logout': 'User logged out of the system',
    'company_created': 'Created new company',
    'company_updated': 'Updated company information',
    'company_deleted': 'Deleted company',
    'company_suspended': 'Suspended company account',
    'company_activated': 'Activated company account',
    'task_created': 'Created new task',
    'task_updated': 'Updated task information',
    'task_deleted': 'Deleted task',
    'task_status_changed': 'Changed task status',
    'task_assigned': 'Assigned task to user',
    'meeting_created': 'Created new meeting',
    'meeting_updated': 'Updated meeting information',
    'meeting_deleted': 'Deleted meeting',
    'meeting_scheduled': 'Scheduled new meeting',
    'leave_requested': 'Submitted leave request',
    'leave_approved': 'Approved leave request',
    'leave_rejected': 'Rejected leave request',
    'subscription_created': 'Created new subscription',
    'subscription_updated': 'Updated subscription',
    'payment_processed': 'Processed payment',
    'login_success': 'Successful login attempt',
    'login_failed': 'Failed login attempt',
    'password_changed': 'Changed password',
    'profile_updated': 'Updated user profile'
  };

  return actionDescriptions[action] || `${action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;
}

function shouldSkipLogging(action, req) {
  // Skip logging for health checks, static files, and certain system routes
  const skipPaths = ['/health', '/favicon.ico', '/static', '/api/health'];

  if (skipPaths.some(path => req.originalUrl.includes(path))) {
    return true;
  }

  // Skip GET requests for read-only operations (optional)
  // Uncomment the following line if you want to skip GET requests
  // if (req.method === 'GET' && !action.includes('login')) return true;

  return false;
}

// Pre-configured middleware for common actions
const auditMiddleware = {
  // User actions
  userCreated: auditLogger('user_created', { category: 'admin', severity: 'medium' }),
  userUpdated: auditLogger('user_updated', { category: 'admin', severity: 'low' }),
  userDeleted: auditLogger('user_deleted', { category: 'admin', severity: 'critical' }),
  userStatusChanged: auditLogger('user_status_changed', { category: 'admin', severity: 'medium' }),
  userLogin: auditLogger('user_login', { category: 'security', severity: 'low' }),
  userLogout: auditLogger('user_logout', { category: 'security', severity: 'low' }),

  // Company actions
  companyCreated: auditLogger('company_created', { category: 'admin', severity: 'medium' }),
  companyUpdated: auditLogger('company_updated', { category: 'admin', severity: 'medium' }),
  companyDeleted: auditLogger('company_deleted', { category: 'admin', severity: 'critical' }),
  companySuspended: auditLogger('company_suspended', { category: 'admin', severity: 'critical' }),
  companyActivated: auditLogger('company_activated', { category: 'admin', severity: 'medium' }),

  // Task actions
  taskCreated: auditLogger('task_created', { category: 'user', severity: 'low' }),
  taskUpdated: auditLogger('task_updated', { category: 'user', severity: 'low' }),
  taskDeleted: auditLogger('task_deleted', { category: 'user', severity: 'medium' }),
  taskStatusChanged: auditLogger('task_status_changed', { category: 'user', severity: 'low' }),
  taskAssigned: auditLogger('task_assigned', { category: 'user', severity: 'low' }),

  // Meeting actions
  meetingCreated: auditLogger('meeting_created', { category: 'user', severity: 'low' }),
  meetingUpdated: auditLogger('meeting_updated', { category: 'user', severity: 'low' }),
  meetingDeleted: auditLogger('meeting_deleted', { category: 'user', severity: 'medium' }),

  // Leave actions
  leaveRequested: auditLogger('leave_requested', { category: 'user', severity: 'low' }),
  leaveApproved: auditLogger('leave_approved', { category: 'user', severity: 'low' }),
  leaveRejected: auditLogger('leave_rejected', { category: 'user', severity: 'low' }),

  // Security actions
  loginSuccess: auditLogger('login_success', { category: 'security', severity: 'low' }),
  loginFailed: auditLogger('login_failed', { category: 'security', severity: 'high' }),
  passwordChanged: auditLogger('password_changed', { category: 'security', severity: 'medium' }),

  // Subscription actions
  subscriptionCreated: auditLogger('subscription_created', { category: 'admin', severity: 'medium' }),
  subscriptionUpdated: auditLogger('subscription_updated', { category: 'admin', severity: 'medium' }),
  paymentProcessed: auditLogger('payment_processed', { category: 'user', severity: 'low' }),
  paymentFailed: auditLogger('payment_failed', { category: 'user', severity: 'high' }),

  // Plan actions
  planCreated: auditLogger('plan_created', { category: 'admin', severity: 'medium' }),
  planUpdated: auditLogger('plan_updated', { category: 'admin', severity: 'medium' }),
  planDeleted: auditLogger('plan_deleted', { category: 'admin', severity: 'high' }),

  // Admin actions
  adminAction: auditLogger('admin_action', { category: 'admin', severity: 'medium' }),
  bulkOperation: auditLogger('bulk_operation', { category: 'admin', severity: 'high' }),
  systemConfigChanged: auditLogger('system_config_changed', { category: 'system', severity: 'high' }),

  // Custom audit logger
  custom: auditLogger,

  // Automatic audit middleware based on HTTP method and path
  autoAudit: (req, res, next) => {
    // This middleware automatically determines the action based on HTTP method and path
    const method = req.method;
    const path = req.originalUrl;

    let action = 'unknown_action';
    let category = 'system';
    let severity = 'low';

    // Determine action based on method and path pattern
    if (method === 'POST') {
      if (path.includes('/users')) action = 'user_created';
      else if (path.includes('/companies')) action = 'company_created';
      else if (path.includes('/tasks')) {
        if (path.includes('/assign')) action = 'task_assigned';
        else action = 'task_created';
      }
      else if (path.includes('/meetings')) action = 'meeting_created';
      else if (path.includes('/leaves')) action = 'leave_requested';
    } else if (method === 'PUT' || method === 'PATCH') {
      if (path.includes('/users')) action = 'user_updated';
      else if (path.includes('/companies')) action = 'company_updated';
      else if (path.includes('/tasks')) {
        if (path.includes('/status')) action = 'task_status_changed';
        else action = 'task_updated';
      }
      else if (path.includes('/meetings')) action = 'meeting_updated';
      else if (path.includes('/leaves')) {
        if (path.includes('/approve')) action = 'leave_approved';
        else if (path.includes('/reject')) action = 'leave_rejected';
        else action = 'leave_updated';
      }
    } else if (method === 'DELETE') {
      if (path.includes('/users')) action = 'user_deleted';
      else if (path.includes('/companies')) action = 'company_deleted';
      else if (path.includes('/tasks')) action = 'task_deleted';
      else if (path.includes('/meetings')) action = 'meeting_deleted';
    }

    // Apply the determined audit logger
    return auditLogger(action, { category, severity })(req, res, next);
  }
};

module.exports = auditMiddleware;
