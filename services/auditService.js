const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const Company = require('../models/Company');

class AuditService {
  // Create a new audit log
  static async createAuditLog(logData) {
    try {
      const auditLog = new AuditLog(logData);
      await auditLog.save();
      console.log(`✅ Audit log created: ${logData.action} by ${logData.userName}`);
      return auditLog;
    } catch (error) {
      console.error('❌ Error creating audit log:', error);
      // Don't throw error to prevent audit logging from breaking main functionality
      return null;
    }
  }

  // Create audit log with user and company enrichment
  static async createAuditLogWithUser(userId, action, description, options = {}) {
    try {
      let user = null;
      let company = null;

      // If user information is provided in options, use it directly
      // This avoids extra database queries when user info is already available from middleware
      if (options.userEmail && options.userName && options.userRole) {
        // User info provided directly, no need to fetch from DB
        console.log('Using provided user info for audit log');
      } else if (userId) {
        // Fetch user details if userId provided and info not already available
        user = await User.findById(userId).select('firstName lastName email role companyId').lean();
      }

      // Fetch company details if companyId provided or user has companyId
      const companyId = options.companyId || (user && user.companyId);
      if (companyId && !options.companyName) {
        company = await Company.findById(companyId).select('name').lean();
      }

      const logData = {
        userId: userId || null,
        userEmail: options.userEmail || (user ? user.email : 'system'),
        userName: options.userName || (user ? `${user.firstName} ${user.lastName}` : 'System'),
        userRole: options.userRole || (user ? user.role : 'system'),
        companyId: companyId || null,
        companyName: options.companyName || (company ? company.name : ''),
        action,
        description,
        category: options.category || this.getCategoryFromAction(action),
        severity: options.severity || this.getSeverityFromAction(action),
        ipAddress: options.ipAddress || '',
        userAgent: options.userAgent || '',
        device: options.device || '',
        location: options.location || '',
        metadata: options.metadata || {},
        status: options.status || 'success',
        sessionId: options.sessionId || null,
        requestId: options.requestId || null
      };

      return await this.createAuditLog(logData);
    } catch (error) {
      console.error('❌ Error creating audit log with user:', error);
      return null;
    }
  }

  // Get category based on action
  static getCategoryFromAction(action) {
    const actionCategories = {
      // Security actions
      'login_success': 'security',
      'login_failed': 'security',
      'logout': 'security',
      'password_changed': 'security',
      'brute_force_attempt': 'security',
      'suspicious_activity': 'security',

      // Admin actions
      'user_created': 'admin',
      'user_updated': 'admin',
      'user_deleted': 'admin',
      'user_status_changed': 'admin',
      'user_role_changed': 'admin',
      'company_created': 'admin',
      'company_updated': 'admin',
      'company_deleted': 'admin',
      'company_suspended': 'admin',
      'company_activated': 'admin',
      'department_created': 'admin',
      'department_updated': 'admin',
      'department_deleted': 'admin',
      'subscription_created': 'admin',
      'subscription_updated': 'admin',
      'subscription_cancelled': 'admin',
      'plan_created': 'admin',
      'plan_updated': 'admin',
      'plan_deleted': 'admin',
      'plan_upgraded': 'admin',
      'plan_downgraded': 'admin',
      'admin_login': 'admin',
      'admin_action': 'admin',
      'bulk_operation': 'admin',
      'system_config_changed': 'admin',

      // System actions
      'system_backup': 'system',
      'system_maintenance': 'system',
      'data_export': 'system',

      // User actions (default)
      'user_login': 'user',
      'user_logout': 'user',
      'user_password_reset': 'user',
      'profile_updated': 'user',
      'settings_changed': 'user',
      'task_created': 'user',
      'task_updated': 'user',
      'task_deleted': 'user',
      'task_status_changed': 'user',
      'task_assigned': 'user',
      'meeting_created': 'user',
      'meeting_updated': 'user',
      'meeting_deleted': 'user',
      'meeting_scheduled': 'user',
      'meeting_attended': 'user',
      'meeting_cancelled': 'user',
      'leave_requested': 'user',
      'leave_approved': 'user',
      'leave_rejected': 'user',
      'leave_cancelled': 'user',
      'payment_processed': 'user',
      'payment_failed': 'user'
    };

    return actionCategories[action] || 'user';
  }

  // Get severity based on action
  static getSeverityFromAction(action) {
    const actionSeverities = {
      // Critical actions
      'company_suspended': 'critical',
      'company_deleted': 'critical',
      'user_deleted': 'critical',
      'brute_force_attempt': 'critical',
      'suspicious_activity': 'critical',
      'system_config_changed': 'critical',

      // High severity
      'login_failed': 'high',
      'payment_failed': 'high',
      'bulk_operation': 'high',
      'plan_deleted': 'high',
      'plan_downgraded': 'high',

      // Medium severity
      'user_status_changed': 'medium',
      'user_role_changed': 'medium',
      'company_updated': 'medium',
      'department_deleted': 'medium',
      'task_deleted': 'medium',
      'subscription_cancelled': 'medium',
      'plan_created': 'medium',
      'plan_updated': 'medium',
      'admin_action': 'medium',

      // Low severity (default)
      'user_created': 'low',
      'user_updated': 'low',
      'task_created': 'low',
      'task_updated': 'low',
      'task_status_changed': 'low',
      'task_assigned': 'low',
      'meeting_created': 'low',
      'meeting_scheduled': 'low',
      'leave_requested': 'low',
      'leave_approved': 'low',
      'profile_updated': 'low',
      'settings_changed': 'low',
      'login_success': 'low',
      'logout': 'low',
      'user_login': 'low',
      'user_logout': 'low',
      'payment_processed': 'low',
      'plan_upgraded': 'low'
    };

    return actionSeverities[action] || 'low';
  }

  // Get audit logs with filters and pagination
  static async getAuditLogs(filters = {}, pagination = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        sortBy = 'timestamp',
        sortOrder = -1
      } = pagination;

      const {
        userId,
        companyId,
        action,
        category,
        severity,
        status,
        startDate,
        endDate,
        searchTerm
      } = filters;

      // Build query
      const query = {};

      if (userId) query.userId = userId;
      if (companyId) query.companyId = companyId;
      if (action) query.action = action;
      if (category) query.category = category;
      if (severity) query.severity = severity;
      if (status) query.status = status;

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      if (searchTerm) {
        query.$or = [
          { userName: new RegExp(searchTerm, 'i') },
          { userEmail: new RegExp(searchTerm, 'i') },
          { action: new RegExp(searchTerm, 'i') },
          { description: new RegExp(searchTerm, 'i') },
          { companyName: new RegExp(searchTerm, 'i') }
        ];
      }

      // Execute query with pagination
      const skip = (page - 1) * limit;
      const sort = {};
      sort[sortBy] = sortOrder;

      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        AuditLog.countDocuments(query)
      ]);

      return {
        logs: logs.map(log => ({
          _id: log._id,
          timestamp: log.timestamp.toISOString(),
          userId: log.userId,
          userEmail: log.userEmail,
          userName: log.userName,
          userRole: log.userRole,
          companyId: log.companyId,
          companyName: log.companyName,
          action: log.action,
          category: log.category,
          severity: log.severity,
          description: log.description,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          device: log.device,
          location: log.location,
          metadata: log.metadata,
          status: log.status
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      console.error('❌ Error fetching audit logs:', error);
      throw error;
    }
  }

  // Get audit statistics
  static async getAuditStats(filters = {}) {
    try {
      const { startDate, endDate, companyId } = filters;

      const matchConditions = {};
      if (companyId) matchConditions.companyId = companyId;
      if (startDate || endDate) {
        matchConditions.timestamp = {};
        if (startDate) matchConditions.timestamp.$gte = new Date(startDate);
        if (endDate) matchConditions.timestamp.$lte = new Date(endDate);
      }

      const stats = await AuditLog.aggregate([
        { $match: matchConditions },
        {
          $group: {
            _id: null,
            totalLogs: { $sum: 1 },
            criticalLogs: {
              $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] }
            },
            securityLogs: {
              $sum: { $cond: [{ $eq: ['$category', 'security'] }, 1, 0] }
            },
            failedLogs: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
            },
            adminLogs: {
              $sum: { $cond: [{ $eq: ['$category', 'admin'] }, 1, 0] }
            },
            userLogs: {
              $sum: { $cond: [{ $eq: ['$category', 'user'] }, 1, 0] }
            }
          }
        }
      ]);

      return stats[0] || {
        totalLogs: 0,
        criticalLogs: 0,
        securityLogs: 0,
        failedLogs: 0,
        adminLogs: 0,
        userLogs: 0
      };
    } catch (error) {
      console.error('❌ Error fetching audit stats:', error);
      throw error;
    }
  }

  // Clean up old audit logs (for maintenance)
  static async cleanupOldLogs(daysToKeep = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await AuditLog.deleteMany({
        timestamp: { $lt: cutoffDate },
        severity: { $in: ['low', 'medium'] } // Keep high and critical logs longer
      });

      console.log(`🧹 Cleaned up ${result.deletedCount} old audit logs`);
      return result.deletedCount;
    } catch (error) {
      console.error('❌ Error cleaning up audit logs:', error);
      throw error;
    }
  }

  // ============================
  // ENHANCED AUDIT SERVICE METHODS
  // ============================

  // Get audit analytics and insights
  static async getAuditAnalytics(filters = {}, options = {}) {
    try {
      const { groupBy = 'day' } = options;
      const matchConditions = this.buildMatchConditions(filters);
      
      const analytics = await AuditLog.aggregate([
        { $match: matchConditions },
        {
          $facet: {
            // Activity trends
            activityTrends: [
              {
                $group: {
                  _id: {
                    date: this.getDateGrouping(groupBy),
                    category: '$category'
                  },
                  count: { $sum: 1 }
                }
              },
              { $sort: { '_id.date': 1 } }
            ],
            
            // Top actions
            topActions: [
              { $group: { _id: '$action', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 10 }
            ],
            
            // Security insights
            securityInsights: [
              {
                $match: { category: 'security' }
              },
              {
                $group: {
                  _id: '$severity',
                  count: { $sum: 1 },
                  failedAttempts: {
                    $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
                  }
                }
              }
            ],
            
            // User activity patterns
            userActivity: [
              {
                $group: {
                  _id: '$userId',
                  userName: { $first: '$userName' },
                  userEmail: { $first: '$userEmail' },
                  totalActions: { $sum: 1 },
                  lastActivity: { $max: '$timestamp' },
                  categories: { $addToSet: '$category' }
                }
              },
              { $sort: { totalActions: -1 } },
              { $limit: 20 }
            ],
            
            // Company activity
            companyActivity: [
              {
                $group: {
                  _id: '$companyId',
                  companyName: { $first: '$companyName' },
                  totalActions: { $sum: 1 },
                  uniqueUsers: { $addToSet: '$userId' },
                  lastActivity: { $max: '$timestamp' }
                }
              },
              {
                $addFields: {
                  uniqueUserCount: { $size: '$uniqueUsers' }
                }
              },
              { $sort: { totalActions: -1 } },
              { $limit: 10 }
            ]
          }
        }
      ]);

      return analytics[0];
    } catch (error) {
      console.error('❌ Error fetching audit analytics:', error);
      throw error;
    }
  }

  // Advanced search with complex queries
  static async advancedSearch(query, filters = {}, pagination = {}, sort = {}) {
    try {
      const {
        page = 1,
        limit = 50
      } = pagination;

      // Build complex query
      const mongoQuery = this.buildAdvancedQuery(query, filters);
      
      const skip = (page - 1) * limit;
      const sortObj = Object.keys(sort).length > 0 ? sort : { timestamp: -1 };

      const [logs, total] = await Promise.all([
        AuditLog.find(mongoQuery)
          .sort(sortObj)
          .skip(skip)
          .limit(limit)
          .lean(),
        AuditLog.countDocuments(mongoQuery)
      ]);

      return {
        logs: logs.map(log => this.formatLogForResponse(log)),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        },
        metadata: {
          query: mongoQuery,
          executionTime: Date.now(),
          filters: filters
        }
      };
    } catch (error) {
      console.error('❌ Error performing advanced search:', error);
      throw error;
    }
  }

  // Get security alerts and critical events
  static async getSecurityAlerts(options = {}) {
    try {
      const {
        severity = 'critical',
        hours = 24,
        companyId,
        limit = 50
      } = options;

      const startDate = new Date();
      startDate.setHours(startDate.getHours() - hours);

      const query = {
        timestamp: { $gte: startDate },
        severity: { $in: severity === 'all' ? ['high', 'critical'] : [severity] },
        ...(companyId && { companyId })
      };

      const alerts = await AuditLog.find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      return alerts.map(log => this.formatLogForResponse(log));
    } catch (error) {
      console.error('❌ Error fetching security alerts:', error);
      throw error;
    }
  }

  // Export audit logs in various formats
  static async exportAuditLogs(filters = {}, options = {}) {
    try {
      const { format = 'csv', includeMetadata = false } = options;
      const query = this.buildMatchConditions(filters);
      
      const logs = await AuditLog.find(query)
        .sort({ timestamp: -1 })
        .limit(10000) // Limit for performance
        .lean();

      const formattedLogs = logs.map(log => this.formatLogForResponse(log));

      switch (format) {
        case 'csv':
          return this.convertToCSV(formattedLogs, includeMetadata);
        case 'json':
          return JSON.stringify(formattedLogs, null, 2);
        case 'xlsx':
          return this.convertToXLSX(formattedLogs, includeMetadata);
        case 'pdf':
          return this.convertToPDF(formattedLogs, includeMetadata);
        default:
          return JSON.stringify(formattedLogs, null, 2);
      }
    } catch (error) {
      console.error('❌ Error exporting audit logs:', error);
      throw error;
    }
  }

  // Get dashboard data for audit logs
  static async getDashboardData(options = {}) {
    try {
      const { companyId, timeRange = '7d' } = options;
      
      const timeRanges = {
        '1d': 1,
        '7d': 7,
        '30d': 30,
        '90d': 90
      };
      
      const days = timeRanges[timeRange] || 7;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const matchConditions = {
        timestamp: { $gte: startDate },
        ...(companyId && { companyId })
      };

      const dashboardData = await AuditLog.aggregate([
        { $match: matchConditions },
        {
          $facet: {
            // Real-time metrics
            realtimeMetrics: [
              {
                $group: {
                  _id: null,
                  totalLogs: { $sum: 1 },
                  criticalLogs: {
                    $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] }
                  },
                  securityLogs: {
                    $sum: { $cond: [{ $eq: ['$category', 'security'] }, 1, 0] }
                  },
                  failedLogs: {
                    $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
                  }
                }
              }
            ],
            
            // Activity by hour (last 24 hours)
            hourlyActivity: [
              {
                $match: {
                  timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                }
              },
              {
                $group: {
                  _id: { $hour: '$timestamp' },
                  count: { $sum: 1 }
                }
              },
              { $sort: { '_id': 1 } }
            ],
            
            // Top users
            topUsers: [
              {
                $group: {
                  _id: '$userId',
                  userName: { $first: '$userName' },
                  userEmail: { $first: '$userEmail' },
                  totalActions: { $sum: 1 },
                  lastActivity: { $max: '$timestamp' }
                }
              },
              { $sort: { totalActions: -1 } },
              { $limit: 10 }
            ],
            
            // Recent critical events
            recentCritical: [
              {
                $match: { severity: 'critical' }
              },
              { $sort: { timestamp: -1 } },
              { $limit: 5 }
            ]
          }
        }
      ]);

      return dashboardData[0];
    } catch (error) {
      console.error('❌ Error fetching dashboard data:', error);
      throw error;
    }
  }

  // Get audit log details with related logs
  static async getAuditLogDetails(logId, options = {}) {
    try {
      const { includeRelated = true } = options;
      
      const log = await AuditLog.findById(logId).lean();
      if (!log) return null;

      const formattedLog = this.formatLogForResponse(log);
      
      if (includeRelated && log.metadata?.resourceId) {
        // Find related logs for the same resource
        const relatedLogs = await AuditLog.find({
          'metadata.resourceId': log.metadata.resourceId,
          'metadata.resourceType': log.metadata.resourceType,
          _id: { $ne: logId }
        })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean();

        formattedLog.relatedLogs = relatedLogs.map(relatedLog => 
          this.formatLogForResponse(relatedLog)
        );
      }

      return formattedLog;
    } catch (error) {
      console.error('❌ Error fetching audit log details:', error);
      throw error;
    }
  }

  // Get audit log trends and patterns
  static async getAuditTrends(options = {}) {
    try {
      const {
        startDate,
        endDate,
        companyId,
        category,
        action,
        groupBy = 'hour'
      } = options;

      const matchConditions = this.buildMatchConditions({
        startDate,
        endDate,
        companyId,
        category,
        action
      });

      const trends = await AuditLog.aggregate([
        { $match: matchConditions },
        {
          $group: {
            _id: this.getDateGrouping(groupBy),
            count: { $sum: 1 },
            categories: { $addToSet: '$category' },
            severities: { $addToSet: '$severity' }
          }
        },
        { $sort: { '_id': 1 } }
      ]);

      return trends;
    } catch (error) {
      console.error('❌ Error fetching audit trends:', error);
      throw error;
    }
  }

  // Get user activity patterns
  static async getUserActivityPatterns(userId, options = {}) {
    try {
      const { startDate, endDate, includeMetadata = false } = options;
      
      const matchConditions = {
        userId,
        ...(startDate && { timestamp: { $gte: new Date(startDate) } }),
        ...(endDate && { timestamp: { $lte: new Date(endDate) } })
      };

      const userActivity = await AuditLog.aggregate([
        { $match: matchConditions },
        {
          $group: {
            _id: null,
            totalActions: { $sum: 1 },
            categories: { $addToSet: '$category' },
            actions: { $addToSet: '$action' },
            firstActivity: { $min: '$timestamp' },
            lastActivity: { $max: '$timestamp' },
            ...(includeMetadata && { logs: { $push: '$$ROOT' } })
          }
        }
      ]);

      return userActivity[0] || {};
    } catch (error) {
      console.error('❌ Error fetching user activity patterns:', error);
      throw error;
    }
  }

  // Get company activity summary
  static async getCompanyActivitySummary(companyId, options = {}) {
    try {
      const { startDate, endDate, includeUsers = true } = options;
      
      const matchConditions = {
        companyId,
        ...(startDate && { timestamp: { $gte: new Date(startDate) } }),
        ...(endDate && { timestamp: { $lte: new Date(endDate) } })
      };

      const companyActivity = await AuditLog.aggregate([
        { $match: matchConditions },
        {
          $group: {
            _id: null,
            totalActions: { $sum: 1 },
            uniqueUsers: { $addToSet: '$userId' },
            categories: { $addToSet: '$category' },
            actions: { $addToSet: '$action' },
            firstActivity: { $min: '$timestamp' },
            lastActivity: { $max: '$timestamp' },
            ...(includeUsers && {
              userActivity: {
                $push: {
                  userId: '$userId',
                  userName: '$userName',
                  userEmail: '$userEmail',
                  action: '$action',
                  timestamp: '$timestamp'
                }
              }
            })
          }
        }
      ]);

      const result = companyActivity[0] || {};
      if (result.uniqueUsers) {
        result.uniqueUserCount = result.uniqueUsers.length;
      }

      return result;
    } catch (error) {
      console.error('❌ Error fetching company activity summary:', error);
      throw error;
    }
  }

  // Add audit log annotation
  static async addAuditLogAnnotation(logId, annotationData) {
    try {
      const { annotation, tags = [], userId } = annotationData;
      
      const log = await AuditLog.findById(logId);
      if (!log) {
        throw new Error('Audit log not found');
      }

      // Add annotation to metadata
      if (!log.metadata.annotations) {
        log.metadata.annotations = [];
      }

      log.metadata.annotations.push({
        annotation,
        tags,
        userId,
        timestamp: new Date()
      });

      await log.save();
      return { success: true, annotation: log.metadata.annotations[log.metadata.annotations.length - 1] };
    } catch (error) {
      console.error('❌ Error adding audit log annotation:', error);
      throw error;
    }
  }

  // Get audit log annotations
  static async getAuditLogAnnotations(logId) {
    try {
      const log = await AuditLog.findById(logId).select('metadata.annotations').lean();
      return log?.metadata?.annotations || [];
    } catch (error) {
      console.error('❌ Error fetching audit log annotations:', error);
      throw error;
    }
  }

  // ============================
  // HELPER METHODS
  // ============================

  // Build match conditions for queries
  static buildMatchConditions(filters) {
    const conditions = {};
    
    if (filters.userId) conditions.userId = filters.userId;
    if (filters.companyId) conditions.companyId = filters.companyId;
    if (filters.action) conditions.action = filters.action;
    if (filters.category) conditions.category = filters.category;
    if (filters.severity) conditions.severity = filters.severity;
    if (filters.status) conditions.status = filters.status;
    if (filters.ipAddress) conditions.ipAddress = filters.ipAddress;
    if (filters.sessionId) conditions.sessionId = filters.sessionId;
    if (filters.resourceType) conditions['metadata.resourceType'] = filters.resourceType;
    if (filters.resourceId) conditions['metadata.resourceId'] = filters.resourceId;

    if (filters.startDate || filters.endDate) {
      conditions.timestamp = {};
      if (filters.startDate) conditions.timestamp.$gte = new Date(filters.startDate);
      if (filters.endDate) conditions.timestamp.$lte = new Date(filters.endDate);
    }

    if (filters.searchTerm) {
      conditions.$or = [
        { userName: new RegExp(filters.searchTerm, 'i') },
        { userEmail: new RegExp(filters.searchTerm, 'i') },
        { action: new RegExp(filters.searchTerm, 'i') },
        { description: new RegExp(filters.searchTerm, 'i') },
        { companyName: new RegExp(filters.searchTerm, 'i') }
      ];
    }

    return conditions;
  }

  // Build advanced query for complex searches
  static buildAdvancedQuery(query, filters) {
    const mongoQuery = this.buildMatchConditions(filters);
    
    // Add complex query conditions
    if (query.and) {
      mongoQuery.$and = query.and;
    }
    if (query.or) {
      mongoQuery.$or = query.or;
    }
    if (query.nor) {
      mongoQuery.$nor = query.nor;
    }

    return mongoQuery;
  }

  // Get date grouping for aggregation
  static getDateGrouping(groupBy) {
    switch (groupBy) {
      case 'hour':
        return { $hour: '$timestamp' };
      case 'day':
        return { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } };
      case 'week':
        return { $week: '$timestamp' };
      case 'month':
        return { $dateToString: { format: '%Y-%m', date: '$timestamp' } };
      default:
        return { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } };
    }
  }

  // Format log for response
  static formatLogForResponse(log) {
    return {
      _id: log._id,
      logId: log.logId,
      timestamp: log.timestamp.toISOString(),
      userId: log.userId,
      userEmail: log.userEmail,
      userName: log.userName,
      userRole: log.userRole,
      companyId: log.companyId,
      companyName: log.companyName,
      departmentId: log.departmentId,
      departmentName: log.departmentName,
      action: log.action,
      category: log.category,
      severity: log.severity,
      priority: log.priority,
      description: log.description,
      summary: log.summary,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      device: log.device,
      browser: log.browser,
      os: log.os,
      location: log.location,
      sessionId: log.sessionId,
      requestId: log.requestId,
      apiEndpoint: log.apiEndpoint,
      httpMethod: log.httpMethod,
      responseCode: log.responseCode,
      metadata: log.metadata,
      status: log.status,
      errorCode: log.errorCode,
      errorMessage: log.errorMessage,
      retentionPeriod: log.retentionPeriod,
      isComplianceRelevant: log.isComplianceRelevant,
      complianceCategory: log.complianceCategory,
      executionTime: log.executionTime,
      dataSize: log.dataSize,
      createdBy: log.createdBy,
      lastModified: log.lastModified,
      version: log.version
    };
  }

  // Convert logs to CSV format
  static convertToCSV(logs, includeMetadata = false) {
    const headers = [
      'Timestamp', 'User Name', 'User Email', 'User Role', 'Company Name',
      'Action', 'Category', 'Severity', 'Description', 'IP Address',
      'Device', 'Location', 'Status'
    ];

    if (includeMetadata) {
      headers.push('Metadata');
    }

    const csvRows = [headers.join(',')];

    logs.forEach(log => {
      const row = [
        log.timestamp,
        `"${log.userName}"`,
        log.userEmail,
        log.userRole,
        `"${log.companyName}"`,
        log.action,
        log.category,
        log.severity,
        `"${log.description}"`,
        log.ipAddress,
        `"${log.device}"`,
        `"${log.location}"`,
        log.status
      ];

      if (includeMetadata) {
        row.push(`"${JSON.stringify(log.metadata).replace(/"/g, '""')}"`);
      }

      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  // Convert logs to XLSX format (Excel)
  static convertToXLSX(logs, includeMetadata = false) {
    // Create a simple CSV-like format that Excel can open
    // This will create a tab-separated file that Excel recognizes
    const headers = [
      'Timestamp', 'User Name', 'User Email', 'User Role', 'Company Name',
      'Action', 'Category', 'Severity', 'Description', 'IP Address',
      'Device', 'Location', 'Status'
    ];

    if (includeMetadata) {
      headers.push('Metadata');
    }

    const rows = [headers.join('\t')];

    logs.forEach(log => {
      const row = [
        log.timestamp,
        log.userName,
        log.userEmail,
        log.userRole,
        log.companyName,
        log.action,
        log.category,
        log.severity,
        log.description,
        log.ipAddress,
        log.device,
        log.location,
        log.status
      ];

      if (includeMetadata) {
        row.push(JSON.stringify(log.metadata));
      }

      rows.push(row.join('\t'));
    });

    return rows.join('\n');
  }
}

module.exports = AuditService;
