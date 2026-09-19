'use strict';

const { taskFingerprint } = require('./taskFingerprint');
const { evaluateIndependence } = require('./independencePolicy');

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
    const member = this.addMember(task, { fingerprint, role: 'primary', independence: task.independence || null });
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
    const member = this.addMember(task, { fingerprint: group.fingerprint, role: 'coalesced', independence: null });
    group.members.push(member);
    return { decision: 'coalesced', fingerprint: group.fingerprint, canonicalTaskId: group.canonicalTaskId };
  }

  addMember(task, context) {
    const member = {
      taskId: String(task.taskId), fingerprint: context.fingerprint, role: context.role,
      independence: context.independence,
      status: 'queued', registeredAt: this.clock(),
    };
    this.tasks.set(member.taskId, member);
    return member;
  }

  registerVerificationReplica(task, descriptor, options = {}) {
    const taskId = String(task?.taskId || '').trim();
    if (!taskId) throw new Error('taskId is required.');
    if (this.tasks.has(taskId)) throw new Error(`taskId '${taskId}' is already registered.`);
    const fingerprint = taskFingerprint(task);
    const group = this.activeGroup(fingerprint);
    if (!group) return { decision: 'replica_rejected', fingerprint, reason: 'no_active_primary' };
    const replicas = group.members.filter((member) => member.role === 'independent_verifier');
    const maximum = Math.max(1, Number(options.maximumReplicas) || 2);
    if (replicas.length >= maximum) return { decision: 'replica_rejected', fingerprint, reason: 'replica_limit' };
    const prior = group.members.map((member) => member.independence).filter(Boolean);
    const evaluation = evaluateIndependence(descriptor, prior, options);
    if (!evaluation.independent) return { decision: 'replica_rejected', fingerprint, reason: evaluation.reason };
    const member = this.addMember(task, {
      fingerprint, role: 'independent_verifier', independence: evaluation.descriptor,
    });
    group.members.push(member);
    return { decision: 'replica_accepted', fingerprint, canonicalTaskId: group.canonicalTaskId, taskId };
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
