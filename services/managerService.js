const User = require('../models/User');
const Task = require('../models/Task');
const Department = require('../models/Department');

class ManagerService {
  /**
   * Get manager dashboard data including team tasks
   * @param {string} managerId - Manager's user ID
   * @returns {Object} Dashboard data with team tasks
   */
  async getDashboard(managerId) {
    try {
      console.log('🔍 ManagerService.getDashboard called for managerId:', managerId);

      // Get manager's team members
      const teamMembers = await this.getTeamMembers(managerId);
      console.log('🔍 Team members found:', teamMembers.length);

      // Get all team member IDs (team only, exclude manager)
      const teamMemberIds = teamMembers.map(member => member._id);
      console.log('🔍 Team member IDs (team only):', teamMemberIds);

      // Get all tasks for team members
      const allTasks = await Task.find({
        assignedTo: { $in: teamMemberIds }
      })
      .populate('assignedTo', 'firstName lastName email role')
      .populate('assignedBy', 'firstName lastName email role')
      .populate('departmentId', 'name')
      .sort({ createdAt: -1 });

      console.log('🔍 All tasks found:', allTasks.length);

      // Filter active tasks (not completed, blocked, or overdue)
      const currentTime = new Date();
      const activeTasks = allTasks.filter(task => {
        const isNotCompleted = task.status !== 'completed';
        const isNotBlocked = task.status !== 'blocked';
        const isNotOverdue = !task.dueDate || new Date(task.dueDate) >= currentTime;
        return isNotCompleted && isNotBlocked && isNotOverdue;
      });

      console.log('🔍 Active tasks:', activeTasks.length);

      // Calculate statistics
      const urgentTasks = activeTasks.filter(task => task.priority === 'urgent');
      const overdueTasks = allTasks.filter(task => 
        task.dueDate && new Date(task.dueDate) < currentTime && task.status !== 'completed'
      );
      const completedTasks = allTasks.filter(task => task.status === 'completed');
      const inProgressTasks = allTasks.filter(task => task.status === 'in_progress');
      const assignedTasks = allTasks.filter(task => task.status === 'assigned');
      const totalTasks = allTasks.length;
      const completionRate = totalTasks > 0 ? 
        Math.round((completedTasks.length / totalTasks) * 100) : 0;

      // Get recent tasks (latest 10)
      const recentTasks = allTasks.slice(0, 10);

      const dashboardData = {
        teamMembers: teamMembers.length,
        teamTasks: totalTasks,
        completionRate,
        taskCounts: {
          total: totalTasks,
          completed: completedTasks.length,
          inProgress: inProgressTasks.length,
          assigned: assignedTasks.length,
          urgent: urgentTasks.length,
          overdue: overdueTasks.length,
          active: activeTasks.length
        },
        urgent: {
          count: urgentTasks.length,
          tasks: urgentTasks.slice(0, 5)
        },
        overdue: {
          count: overdueTasks.length,
          tasks: overdueTasks.slice(0, 5)
        },
        recentTasks: recentTasks
      };

      console.log('🔍 Dashboard data prepared:', {
        teamMembers: dashboardData.teamMembers,
        teamTasks: dashboardData.teamTasks,
        completionRate: dashboardData.completionRate,
        urgentCount: dashboardData.urgent.count,
        overdueCount: dashboardData.overdue.count,
        recentTasksCount: dashboardData.recentTasks.length
      });

      return dashboardData;
    } catch (error) {
      console.error('❌ ManagerService.getDashboard error:', error);
      throw error;
    }
  }

  /**
   * Get team members under a manager
   * @param {string} managerId - Manager's user ID
   * @returns {Array} Array of team members with task statistics
   */
  async getTeamMembers(managerId) {
    try {
      console.log('🔍 ManagerService.getTeamMembers called for managerId:', managerId);

      // Get users where managerId matches the current manager
      const teamMembers = await User.find({
        $or: [
          { managerId: managerId },
          { manager: managerId }
        ],
        isActive: true
      }).populate('departmentId', 'name');

      console.log('🔍 Raw team members found:', teamMembers.length);

      // Get task statistics for each team member
      const teamMembersWithStats = await Promise.all(
        teamMembers.map(async (member) => {
          const tasks = await Task.find({ assignedTo: member._id });
          const completed = tasks.filter(t => t.status === 'completed').length;
          const inProgress = tasks.filter(t => t.status === 'in_progress').length;
          const assigned = tasks.filter(t => t.status === 'assigned').length;
          const urgent = tasks.filter(t => t.priority === 'urgent').length;
          const overdue = tasks.filter(t => 
            t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed'
          ).length;

          const memberData = {
            _id: member._id,
            firstName: member.firstName,
            lastName: member.lastName,
            name: member.name || `${member.firstName} ${member.lastName}`.trim(),
            email: member.email,
            role: member.role,
            position: member.position,
            departmentId: member.departmentId,
            managerId: member.managerId || member.manager,
            isActive: member.isActive,
            taskStats: {
              total: tasks.length,
              completed,
              inProgress,
              assigned,
              urgent,
              overdue,
              completionRate: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0
            }
          };

          console.log(`🔍 Member ${memberData.name} stats:`, memberData.taskStats);
          return memberData;
        })
      );

      console.log('🔍 Team members with stats:', teamMembersWithStats.length);
      return teamMembersWithStats;
    } catch (error) {
      console.error('❌ ManagerService.getTeamMembers error:', error);
      throw error;
    }
  }

  /**
   * Get urgent tasks for manager's team
   * @param {string} managerId - Manager's user ID
   * @returns {Array} Array of urgent tasks
   */
  async getUrgentTasks(managerId) {
    try {
      const teamMembers = await this.getTeamMembers(managerId);
      const teamMemberIds = teamMembers.map(member => member._id);

      const urgentTasks = await Task.find({
        assignedTo: { $in: teamMemberIds },
        priority: 'urgent',
        status: { $nin: ['completed', 'cancelled'] }
      })
      .populate('assignedTo', 'firstName lastName email role')
      .populate('assignedBy', 'firstName lastName email role')
      .populate('departmentId', 'name')
      .sort({ createdAt: -1 });

      return urgentTasks;
    } catch (error) {
      console.error('❌ ManagerService.getUrgentTasks error:', error);
      throw error;
    }
  }

  /**
   * Get overdue tasks for manager's team
   * @param {string} managerId - Manager's user ID
   * @returns {Array} Array of overdue tasks
   */
  async getOverdueTasks(managerId) {
    try {
      const teamMembers = await this.getTeamMembers(managerId);
      const teamMemberIds = teamMembers.map(member => member._id);

      const currentTime = new Date();
      const overdueTasks = await Task.find({
        assignedTo: { $in: teamMemberIds },
        dueDate: { $lt: currentTime },
        status: { $nin: ['completed', 'cancelled'] }
      })
      .populate('assignedTo', 'firstName lastName email role')
      .populate('assignedBy', 'firstName lastName email role')
      .populate('departmentId', 'name')
      .sort({ dueDate: 1 }); // Sort by due date (most overdue first)

      return overdueTasks;
    } catch (error) {
      console.error('❌ ManagerService.getOverdueTasks error:', error);
      throw error;
    }
  }

  /**
   * Get team performance metrics
   * @param {string} managerId - Manager's user ID
   * @returns {Object} Team performance data
   */
  async getTeamPerformance(managerId) {
    try {
      const teamMembers = await this.getTeamMembers(managerId);
      const teamMemberIds = teamMembers.map(member => member._id);

      const tasks = await Task.find({
        assignedTo: { $in: teamMemberIds }
      });

      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === 'completed').length;
      const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
      const urgentTasks = tasks.filter(t => t.priority === 'urgent').length;
      const overdueTasks = tasks.filter(t => 
        t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed'
      ).length;

      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      return {
        totalTasks,
        completedTasks,
        inProgressTasks,
        urgentTasks,
        overdueTasks,
        completionRate,
        teamSize: teamMembers.length
      };
    } catch (error) {
      console.error('❌ ManagerService.getTeamPerformance error:', error);
      throw error;
    }
  }

  // Get team management overview
  async getTeamManagementOverview(managerId) {
    try {
      console.log('🔍 ManagerService.getTeamManagementOverview - managerId:', managerId);

      // Get manager's team members
      const teamMembers = await User.find({ managerId })
        .populate('departmentId', 'name color')
        .select('firstName lastName email role isActive createdAt managerId departmentId');

      // Get team tasks
      const teamMemberIds = teamMembers.map(member => member._id);
      const allTasks = await Task.find({
        assignedTo: { $in: teamMemberIds }
      })
      .populate('assignedTo', 'firstName lastName email role')
      .populate('assignedBy', 'firstName lastName email role')
      .populate('departmentId', 'name')
      .sort({ createdAt: -1 });

      // Calculate team statistics
      const totalMembers = teamMembers.length;
      const activeMembers = teamMembers.filter(member => member.isActive).length;
      const totalTasks = allTasks.length;
      const completedTasks = allTasks.filter(task => task.status === 'completed').length;
      const inProgressTasks = allTasks.filter(task => task.status === 'in_progress').length;
      const overdueTasks = allTasks.filter(task => {
        const now = new Date();
        return task.dueDate && new Date(task.dueDate) < now && task.status !== 'completed';
      }).length;

      const teamCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      const avgTasksPerMember = totalMembers > 0 ? Math.round(totalTasks / totalMembers) : 0;

      // Get member-specific task statistics
      const memberStats = teamMembers.map(member => {
        const memberTasks = allTasks.filter(task => 
          task.assignedTo._id.toString() === member._id.toString()
        );
        const memberCompletedTasks = memberTasks.filter(task => task.status === 'completed');
        const memberPendingTasks = memberTasks.filter(task => 
          task.status === 'assigned' || task.status === 'in_progress'
        );
        const memberCompletionRate = memberTasks.length > 0 
          ? Math.round((memberCompletedTasks.length / memberTasks.length) * 100)
          : 0;

        return {
          member: {
            _id: member._id,
            name: `${member.firstName} ${member.lastName}`,
            email: member.email,
            role: member.role,
            isActive: member.isActive,
            departmentId: member.departmentId,
            createdAt: member.createdAt
          },
          totalTasks: memberTasks.length,
          completedTasks: memberCompletedTasks.length,
          pendingTasks: memberPendingTasks.length,
          completionRate: memberCompletionRate,
          tasks: memberTasks
        };
      });

      return {
        teamStats: {
          totalMembers,
          activeMembers,
          totalTasks,
          completedTasks,
          inProgressTasks,
          overdueTasks,
          teamCompletionRate,
          avgTasksPerMember
        },
        memberStats,
        allTasks
      };
    } catch (error) {
      console.error('❌ ManagerService.getTeamManagementOverview error:', error);
      throw error;
    }
  }

  // Get team member details
  async getTeamMemberDetails(managerId, memberId) {
    try {
      console.log('🔍 ManagerService.getTeamMemberDetails - managerId:', managerId, 'memberId:', memberId);

      // Verify member belongs to manager
      const member = await User.findOne({ 
        _id: memberId, 
        managerId 
      })
      .populate('departmentId', 'name color')
      .select('firstName lastName email role isActive createdAt managerId departmentId');

      if (!member) {
        throw new Error('Team member not found or access denied');
      }

      // Get member's tasks
      const memberTasks = await Task.find({ assignedTo: memberId })
        .populate('assignedTo', 'firstName lastName email role')
        .populate('assignedBy', 'firstName lastName email role')
        .populate('departmentId', 'name')
        .sort({ createdAt: -1 });

      // Calculate member statistics
      const totalTasks = memberTasks.length;
      const completedTasks = memberTasks.filter(task => task.status === 'completed').length;
      const pendingTasks = memberTasks.filter(task => 
        task.status === 'assigned' || task.status === 'in_progress'
      ).length;
      const overdueTasks = memberTasks.filter(task => {
        const now = new Date();
        return task.dueDate < now && task.status !== 'completed';
      }).length;

      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      return {
        member: {
          _id: member._id,
          name: `${member.firstName} ${member.lastName}`,
          email: member.email,
          role: member.role,
          isActive: member.isActive,
          departmentId: member.departmentId,
          createdAt: member.createdAt
        },
        stats: {
          totalTasks,
          completedTasks,
          pendingTasks,
          overdueTasks,
          completionRate
        },
        tasks: memberTasks
      };
    } catch (error) {
      console.error('❌ ManagerService.getTeamMemberDetails error:', error);
      throw error;
    }
  }

  // Update team member status
  async updateTeamMemberStatus(managerId, memberId, isActive) {
    try {
      console.log('🔍 ManagerService.updateTeamMemberStatus - managerId:', managerId, 'memberId:', memberId, 'isActive:', isActive);

      // Verify member belongs to manager
      const member = await User.findOne({ 
        _id: memberId, 
        managerId 
      });

      if (!member) {
        throw new Error('Team member not found or access denied');
      }

      // Update member status
      const updatedMember = await User.findByIdAndUpdate(
        memberId,
        { isActive },
        { new: true }
      )
      .populate('departmentId', 'name color')
      .select('firstName lastName email role isActive createdAt managerId departmentId');

      return {
        member: {
          _id: updatedMember._id,
          name: `${updatedMember.firstName} ${updatedMember.lastName}`,
          email: updatedMember.email,
          role: updatedMember.role,
          isActive: updatedMember.isActive,
          departmentId: updatedMember.departmentId,
          createdAt: updatedMember.createdAt
        }
      };
    } catch (error) {
      console.error('❌ ManagerService.updateTeamMemberStatus error:', error);
      throw error;
    }
  }

  // Get team performance analytics
  async getTeamPerformanceAnalytics(managerId) {
    try {
      console.log('🔍 ManagerService.getTeamPerformanceAnalytics - managerId:', managerId);

      // Get team members
      const teamMembers = await User.find({ managerId })
        .select('firstName lastName email role isActive createdAt');

      // Get team tasks
      const teamMemberIds = teamMembers.map(member => member._id);
      const allTasks = await Task.find({
        assignedTo: { $in: teamMemberIds }
      })
      .populate('assignedTo', 'firstName lastName email role')
      .populate('assignedBy', 'firstName lastName email role')
      .sort({ createdAt: -1 });

      // Calculate performance metrics
      const performanceMetrics = teamMembers.map(member => {
        const memberTasks = allTasks.filter(task => 
          task.assignedTo._id.toString() === member._id.toString()
        );
        const completedTasks = memberTasks.filter(task => task.status === 'completed').length;
        const completionRate = memberTasks.length > 0 
          ? Math.round((completedTasks / memberTasks.length) * 100)
          : 0;

        // Calculate efficiency based on completion rate and task volume
        let efficiency = 'low';
        if (completionRate >= 80 && memberTasks.length >= 5) {
          efficiency = 'high';
        } else if (completionRate >= 60 || memberTasks.length >= 3) {
          efficiency = 'medium';
        }

        return {
          member: {
            _id: member._id,
            name: `${member.firstName} ${member.lastName}`,
            email: member.email,
            role: member.role,
            isActive: member.isActive
          },
          totalTasks: memberTasks.length,
          completedTasks,
          completionRate,
          efficiency,
          tasks: memberTasks
        };
      });

      // Sort by performance (completion rate)
      performanceMetrics.sort((a, b) => b.completionRate - a.completionRate);

      return {
        performanceMetrics,
        teamStats: {
          totalMembers: teamMembers.length,
          highPerformers: performanceMetrics.filter(m => m.efficiency === 'high').length,
          mediumPerformers: performanceMetrics.filter(m => m.efficiency === 'medium').length,
          lowPerformers: performanceMetrics.filter(m => m.efficiency === 'low').length,
          avgCompletionRate: performanceMetrics.length > 0 
            ? Math.round(performanceMetrics.reduce((sum, m) => sum + m.completionRate, 0) / performanceMetrics.length)
            : 0
        }
      };
    } catch (error) {
      console.error('❌ ManagerService.getTeamPerformanceAnalytics error:', error);
      throw error;
    }
  }
}

module.exports = ManagerService;
