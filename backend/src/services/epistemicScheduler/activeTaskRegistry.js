'use strict';

const { taskFingerprint } = require('./taskFingerprint');

const ACTIVE = new Set(['queued', 'running', 'verifying']);

class ActiveTaskRegistry {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date().toISOString());
    this.groups = new Map();
    this.tasks = new Map();
  }

  register(task, options = {}) {
    const taskId = String(task?.taskId || '').trim();
    if (!taskId) throw new Error('taskId is required.');
    if (this.tasks.has(taskId)) throw new Error(`taskId '${taskId}' is already registered.`);
    const fingerprint = taskFingerprint(task);
    const active = this.activeGroup(fingerprint);
    if (active) return this.handleDuplicate(task, active, options);
    const member = this.addMember(task, fingerprint, 'primary');
    this.groups.set(fingerprint, { fingerprint, canonicalTaskId: taskId, members: [member] });
    return { decision: 'accepted', fingerprint, canonicalTaskId: taskId };
  }

  activeGroup(fingerprint) {
    const group = this.groups.get(fingerprint);
    if (!group) return null;
    return group.members.some((member) => ACTIVE.has(member.status)) ? group : null;
  }

  handleDuplicate(task, group, options) {
    if (options.duplicatePolicy === 'reject') {
      return { decision: 'rejected', fingerprint: group.fingerprint, canonicalTaskId: group.canonicalTaskId };
    }
    const member = this.addMember(task, group.fingerprint, 'coalesced');
    group.members.push(member);
    return { decision: 'coalesced', fingerprint: group.fingerprint, canonicalTaskId: group.canonicalTaskId };
  }

  addMember(task, fingerprint, role) {
    const member = {
      taskId: String(task.taskId), fingerprint, role,
      status: 'queued', registeredAt: this.clock(),
    };
    this.tasks.set(member.taskId, member);
    return member;
  }

  transition(taskId, status) {
    const member = this.tasks.get(taskId);
    if (!member) throw new Error(`Unknown task '${taskId}'.`);
    member.status = String(status);
    return { ...member };
  }

  snapshot() {
    return [...this.groups.values()].map((group) => ({
      fingerprint: group.fingerprint,
      canonicalTaskId: group.canonicalTaskId,
      members: group.members.map((member) => ({ ...member })),
    }));
  }
}

module.exports = { ACTIVE, ActiveTaskRegistry };
