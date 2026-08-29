const { Op } = require('sequelize');
const projectService = require('../../services/pm/project.service');
const { sendSuccess } = require('../../utils/response');

const getProjects = async (req, res, next) => {
  try { sendSuccess(res, await projectService.getProjects(req.query, req.user)); }
  catch (e) { next(e); }
};

const getProjectById = async (req, res, next) => {
  try { sendSuccess(res, await projectService.getProjectById(req.params.id, req.user)); }
  catch (e) { next(e); }
};

const createProject = async (req, res, next) => {
  try { sendSuccess(res, await projectService.createProject(req.body, req.user), 'Project created', 201); }
  catch (e) { next(e); }
};

const updateProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Managers who are not the assigned project manager/owner can only update endDate
    if (user.role === 'manager') {
      const project = await projectService.getProject(id);
      if (project) {
        const isProjectOwner =
          String(project.ownerId) === String(user._id) ||
          String(project.managerId) === String(user._id);
        if (!isProjectOwner) {
          const { endDate } = req.body;
          if (!endDate) {
            return res.status(400).json({ success: false, message: 'Only endDate can be updated by managers. Please provide a valid endDate.' });
          }
          return sendSuccess(
            res,
            await projectService.updateProject(id, { endDate }, user),
            'Project end date updated'
          );
        }
      }
    }

    sendSuccess(res, await projectService.updateProject(id, req.body, user), 'Project updated');
  } catch (e) {
    next(e);
  }
};

const deleteProject = async (req, res, next) => {
  try { await projectService.deleteProject(req.params.id, req.user); sendSuccess(res, null, 'Project deleted'); }
  catch (e) { next(e); }
};

const getProjectSummary = async (req, res, next) => {
  try { sendSuccess(res, await projectService.getProjectSummary(req.params.id, req.user)); }
  catch (e) { next(e); }
};

// Members
const getMembers = async (req, res, next) => {
  try { sendSuccess(res, await projectService.getMembers(req.params.id, req.user)); }
  catch (e) { next(e); }
};
const addMember = async (req, res, next) => {
  try { sendSuccess(res, await projectService.addMember(req.params.id, req.body, req.user), 'Member added', 201); }
  catch (e) { next(e); }
};
const updateMember = async (req, res, next) => {
  try { sendSuccess(res, await projectService.updateMember(req.params.id, req.params.memberId, req.body, req.user), 'Member updated'); }
  catch (e) { next(e); }
};
const removeMember = async (req, res, next) => {
  try { await projectService.removeMember(req.params.id, req.params.memberId, req.user); sendSuccess(res, null, 'Member removed'); }
  catch (e) { next(e); }
};

// Recipients
const getRecipients = async (req, res, next) => {
  try { sendSuccess(res, await projectService.getRecipients(req.params.id, req.user)); }
  catch (e) { next(e); }
};
const addRecipient = async (req, res, next) => {
  try { sendSuccess(res, await projectService.addRecipient(req.params.id, req.body, req.user), 'Recipient added', 201); }
  catch (e) { next(e); }
};
const removeRecipient = async (req, res, next) => {
  try { await projectService.removeRecipient(req.params.id, req.params.recipientId, req.user); sendSuccess(res, null, 'Recipient removed'); }
  catch (e) { next(e); }
};

// GET /pm/projects/:id/allocation-preview
// Returns each member's allocations across all their projects in a given date range
const getAllocationPreview = async (req, res, next) => {
  try {
    const { fromDate, toDate } = req.query;
    const projectId = req.params.id;

    // Get members of this project with their allocations
    const ProjectMember = require('../../models/pm/ProjectMember');
    const Project = require('../../models/pm/Project');
    const User = require('../../models/User');

    const members = await ProjectMember.findAll({
      where: { projectId },
      include: [{ model: User, as: 'user', attributes: ['id','name','email','designation'] }],
    });

    // For each member, find all their allocations across all projects
    const preview = await Promise.all(members.map(async (member) => {
      const allAllocations = await ProjectMember.findAll({
        where: {
          userId: member.userId,
          allocationPct: { [Op.not]: null },
        },
        include: [{ model: Project, as: 'project', attributes: ['id','name'] }],
      });

      // Calculate conflicts: weeks where total > 100%
      const conflicts = [];
      if (fromDate && toDate && allAllocations.length > 0) {
        const start = new Date(fromDate);
        const end = new Date(toDate);
        const current = new Date(start);
        while (current <= end) {
          const weekTotal = allAllocations
            .filter(a => {
              if (!a.allocationFrom || !a.allocationTo) return false;
              return new Date(a.allocationFrom) <= current && new Date(a.allocationTo) >= current;
            })
            .reduce((sum, a) => sum + (a.allocationPct || 0), 0);

          if (weekTotal > 100) {
            conflicts.push({
              date: current.toISOString().split('T')[0],
              totalPct: weekTotal,
              projects: allAllocations
                .filter(a => a.allocationFrom && a.allocationTo &&
                  new Date(a.allocationFrom) <= current && new Date(a.allocationTo) >= current)
                .map(a => ({ projectId: a.projectId, projectName: a.project?.name, pct: a.allocationPct }))
            });
          }
          current.setDate(current.getDate() + 1); // move by day
        }
      }

      return {
        userId: member.userId,
        user: member.user,
        allocationPct: member.allocationPct,
        allocationFrom: member.allocationFrom,
        allocationTo: member.allocationTo,
        allAllocations: allAllocations.map(a => ({
          projectId: a.projectId,
          projectName: a.project?.name,
          pct: a.allocationPct,
          from: a.allocationFrom,
          to: a.allocationTo,
        })),
        conflicts,
        hasConflict: conflicts.length > 0,
      };
    }));

    sendSuccess(res, preview);
  } catch (e) { next(e); }
};

// POST /pm/projects/:id/allocation-approval
const requestAllocationApproval = async (req, res, next) => {
  try {
    const { userId, allocationPct, fromDate, toDate, reason } = req.body;
    // Validate allocationPct
    const pct = Number(allocationPct);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
      return res.status(400).json({ success: false, message: 'allocationPct must be a number between 1 and 100' });
    }
    // Validate dates
    if (!fromDate || isNaN(new Date(fromDate).getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid fromDate' });
    }
    if (!toDate || isNaN(new Date(toDate).getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid toDate' });
    }
    if (new Date(fromDate) > new Date(toDate)) {
      return res.status(400).json({ success: false, message: 'fromDate must be before toDate' });
    }
    // Validate userId exists
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }
    const User = require('../../models/User');
    const targetUser = await User.findByPk(userId, { attributes: ['id'] });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const PmAllocationApproval = require('../../models/pm/PmAllocationApproval');
    const approval = await PmAllocationApproval.create({
      id: require('crypto').randomUUID(),
      projectId: req.params.id,
      userId,
      requestedById: req.user._id || req.user.id,
      allocationPct,
      fromDate,
      toDate,
      reason,
      status: 'pending',
    });
    sendSuccess(res, approval, 'Approval request submitted', 201);
  } catch (e) { next(e); }
};

// PATCH /pm/projects/:id/allocation-approval/:approvalId
const respondAllocationApproval = async (req, res, next) => {
  try {
    const { status, approverNote } = req.body; // status: 'approved' | 'rejected'
    const PmAllocationApproval = require('../../models/pm/PmAllocationApproval');
    const approval = await PmAllocationApproval.findByPk(req.params.approvalId);
    if (!approval) return res.status(404).json({ success: false, message: 'Approval not found' });
    await approval.update({
      status,
      approverNote,
      approvedById: req.user._id || req.user.id,
    });
    sendSuccess(res, approval, `Approval ${status}`);
  } catch (e) { next(e); }
};

// GET /pm/projects/:id/allocation-approvals
// Returns pending requests where other PMs are asking this project to release a member's capacity
const getProjectAllocationApprovals = async (req, res, next) => {
  try {
    const { id } = req.params;
    const PmAllocationApproval = require('../../models/pm/PmAllocationApproval');
    const User = require('../../models/User');

    const approvals = await PmAllocationApproval.findAll({
      where: { projectId: id, status: 'pending' },
      order: [['createdAt', 'DESC']],
    });

    // Enrich with user data (the member being requested, and who submitted the request)
    const userIds = [...new Set([
      ...approvals.map(a => a.userId),
      ...approvals.map(a => a.requestedById),
    ])].filter(Boolean);

    const users = await User.findAll({ where: { id: userIds }, attributes: ['id', 'name', 'email'] });
    const userMap = Object.fromEntries(users.map(u => [String(u.id), u.toJSON()]));

    const enriched = approvals.map(a => ({
      ...a.toJSON(),
      requestedUser: userMap[String(a.userId)] || null,
      requester: userMap[String(a.requestedById)] || null,
    }));

    return sendSuccess(res, enriched, 'Approval requests fetched');
  } catch (err) { next(err); }
};

// PATCH /pm/projects/:id/allocation-approvals/:approvalId
// Manager of the source project approves or rejects the capacity release request
const respondToAllocationApproval = async (req, res, next) => {
  try {
    const { approvalId } = req.params;
    const { action, responseNote } = req.body; // action: 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be approve or reject' });
    }
    const PmAllocationApproval = require('../../models/pm/PmAllocationApproval');
    const ProjectMember = require('../../models/pm/ProjectMember');

    const approval = await PmAllocationApproval.findByPk(approvalId);
    if (!approval) return res.status(404).json({ success: false, message: 'Approval request not found' });

    // Guard: prevent re-deciding an already approved or rejected request
    if (approval.status !== 'pending') {
      return res.status(409).json({
        success: false,
        message: `This request has already been ${approval.status}. No changes made.`,
      });
    }

    await approval.update({
      status: action === 'approve' ? 'approved' : 'rejected',
      approverNote: responseNote || null,
      approvedById: req.user._id || req.user.id,
    });

    // If approved, update the member's allocation in this project to the agreed percentage
    if (action === 'approve' && approval.allocationPct !== null) {
      await ProjectMember.update(
        { allocationPct: approval.allocationPct },
        { where: { projectId: approval.projectId, userId: approval.userId } }
      );
    }

    return sendSuccess(res, approval, `Request ${action}d`);
  } catch (err) { next(err); }
};

// GET /pm/users/:userId/availability
const getUserAvailability = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { fromDate, toDate } = req.query;

    const ProjectMember = require('../../models/pm/ProjectMember');
    const Project = require('../../models/pm/Project');

    // Get all active project memberships for this user
    const memberships = await ProjectMember.findAll({
      where: { userId },
      include: [{
        model: Project,
        as: 'project',
        attributes: ['id', 'name', 'status', 'startDate', 'endDate', 'managerId'],
        where: { status: { [Op.notIn]: ['completed', 'cancelled', 'closed'] } },
        required: true,
      }],
    });

    // Calculate allocation stats
    const allocations = memberships.map(m => {
      const pct = m.allocationPct !== null && m.allocationPct !== undefined ? m.allocationPct : 100;
      return {
        projectId: m.projectId,
        projectName: m.project?.name,
        projectStatus: m.project?.status,
        projectManagerId: m.project?.managerId,
        allocationPct: pct,
        allocationFrom: m.allocationFrom,
        allocationTo: m.allocationTo,
        allocationStatus: m.allocationStatus,
        isAssumed100: m.allocationPct === null || m.allocationPct === undefined,
      };
    });

    // Filter to date range if provided (allocations overlapping the requested range)
    let relevantAllocations = allocations;
    if (fromDate && toDate) {
      const from = new Date(fromDate);
      const to = new Date(toDate);
      relevantAllocations = allocations.filter(a => {
        if (!a.allocationFrom || !a.allocationTo) return true; // no dates = assume overlaps
        return new Date(a.allocationTo) >= from && new Date(a.allocationFrom) <= to;
      });
    }

    // Sum total committed %
    const totalCommitted = relevantAllocations.reduce((sum, a) => sum + a.allocationPct, 0);
    const freeCapacity = Math.max(0, 100 - totalCommitted);
    const isOverAllocated = totalCommitted > 100;

    // Find next free date (earliest allocationTo across all active memberships)
    const nextFreeDate = allocations
      .filter(a => a.allocationTo)
      .map(a => new Date(a.allocationTo))
      .sort((a, b) => a - b)[0]?.toISOString().slice(0, 10) || null;

    // Conflict suggestions (if over-allocated for the requested range)
    const suggestions = [];
    if (isOverAllocated && fromDate && toDate) {
      const excess = totalCommitted - 100;

      // Suggestion 1: Reduce allocation %
      suggestions.push({
        type: 'reduce_pct',
        label: 'Reduce allocation percentage',
        description: `Reduce the new assignment to ${Math.max(5, 100 - excess)}% to stay within 100% capacity`,
        suggestedPct: Math.max(5, 100 - excess),
      });

      // Suggestion 2: Shift dates
      const latestEnd = allocations
        .filter(a => a.allocationTo)
        .map(a => new Date(a.allocationTo))
        .sort((a, b) => b - a)[0];
      if (latestEnd) {
        const suggestedStart = new Date(latestEnd);
        suggestedStart.setDate(suggestedStart.getDate() + 1);
        suggestions.push({
          type: 'shift_dates',
          label: 'Shift start date',
          description: `Start this assignment from ${suggestedStart.toISOString().slice(0, 10)} when capacity becomes available`,
          suggestedFromDate: suggestedStart.toISOString().slice(0, 10),
        });
      }

      // Suggestion 3: Free up from existing project (requires manager approval)
      const freeable = relevantAllocations.filter(a => a.projectManagerId && a.projectManagerId !== (req.user?._id || req.user?.id));
      if (freeable.length > 0) {
        suggestions.push({
          type: 'request_approval',
          label: 'Request capacity release',
          description: `Request the manager of ${freeable[0].projectName} to temporarily reduce this person's allocation on that project`,
          targetProjectId: freeable[0].projectId,
          targetProjectName: freeable[0].projectName,
          targetManagerId: freeable[0].projectManagerId,
        });
      }
    }

    return sendSuccess(res, {
      userId,
      allocations: relevantAllocations,
      totalCommitted,
      freeCapacity,
      isOverAllocated,
      nextFreeDate,
      hasNoData: allocations.length === 0,
      suggestions,
    }, 'User availability fetched');
  } catch (err) {
    next(err);
  }
};

// GET /pm/projects/:id/members/availability
// Batch: returns cross-project availability for ALL members of a project in one query
const getMembersAvailability = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ProjectMember = require('../../models/pm/ProjectMember');
    const Project = require('../../models/pm/Project');
    const User = require('../../models/User');

    // Step 1: Get all userIds on this project
    const thisProjectMembers = await ProjectMember.findAll({
      where: { projectId: id },
      attributes: ['userId'],
    });
    const userIds = [...new Set(thisProjectMembers.map(m => m.userId).filter(Boolean))];

    if (userIds.length === 0) return sendSuccess(res, [], 'No members');

    // Step 2: Get ALL active project memberships for all those users in ONE query
    // Include User so the response carries name/email/designation without extra round-trips.
    const allMemberships = await ProjectMember.findAll({
      where: { userId: userIds },
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'status', 'managerId'],
          where: { status: { [Op.notIn]: ['completed', 'cancelled', 'closed'] } },
          required: true,
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'designation'],
          required: false,
        },
      ],
    });

    // Step 3: Group by userId
    const byUser = {};
    for (const uid of userIds) byUser[uid] = [];
    for (const m of allMemberships) {
      const uid = String(m.userId);
      if (byUser[uid]) byUser[uid].push(m);
    }

    // Step 4: Compute stats per user
    const result = userIds.map(userId => {
      const memberships = byUser[String(userId)] || [];

      if (memberships.length === 0) {
        return { userId, hasNoData: true, totalCommitted: 0, freeCapacity: 100, allocations: [], nextFreeDate: null, isOverAllocated: false };
      }

      const allocations = memberships.map(m => {
        const pct = (m.allocationPct !== null && m.allocationPct !== undefined) ? Number(m.allocationPct) : 100;
        return {
          projectId: m.projectId,
          projectName: m.project?.name || 'Unknown',
          allocationPct: pct,
          allocationFrom: m.allocationFrom,
          allocationTo: m.allocationTo,
          isAssumed100: (m.allocationPct === null || m.allocationPct === undefined),
        };
      });

      const totalCommitted = allocations.reduce((sum, a) => sum + a.allocationPct, 0);
      const freeCapacity = Math.max(0, 100 - totalCommitted);
      const isOverAllocated = totalCommitted > 100;

      // Next free date: earliest allocationTo across ALL memberships (including current project)
      // for consistency with getUserAvailability
      const futureDates = allocations
        .filter(a => a.allocationTo)
        .map(a => new Date(a.allocationTo))
        .sort((a, b) => a - b);
      const nextFreeDate = futureDates[0]?.toISOString().slice(0, 10) || null;

      // Attach user identity from the first membership (all share the same user)
      const userIdentity = memberships[0]?.user?.toJSON ? memberships[0].user.toJSON() : memberships[0]?.user || null;

      return {
        userId,
        user: userIdentity,
        hasNoData: false,
        totalCommitted,
        freeCapacity,
        isOverAllocated,
        allocations,
        nextFreeDate,
        projectCount: allocations.length,
      };
    });

    return sendSuccess(res, result, 'Member availability fetched');
  } catch (err) { next(err); }
};

module.exports = {
  getProjects, getProjectById, createProject, updateProject, deleteProject, getProjectSummary,
  getMembers, addMember, updateMember, removeMember,
  getRecipients, addRecipient, removeRecipient,
  getAllocationPreview, requestAllocationApproval,
  // respondAllocationApproval (line ~216) intentionally omitted — it is an
  // incomplete duplicate of respondToAllocationApproval; only the latter is exported.
  getProjectAllocationApprovals, respondToAllocationApproval,
  getUserAvailability,
  getMembersAvailability,
};
