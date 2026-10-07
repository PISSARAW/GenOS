permit (principal, action == GenOS::Action::"Control", resource)
when {
  principal.workspaceId == context.workspaceId &&
  resource.workspaceId == context.workspaceId &&
  (principal == resource ||
   principal.executionMode == "orchestrator" ||
   resource.parentId == principal.agentId)
};

permit (principal, action == GenOS::Action::"StartMission", resource)
when {
  principal.workspaceId == context.workspaceId &&
  resource.workspaceId == context.workspaceId &&
  principal.executionMode == "worker" &&
  resource.executionMode == "worker" &&
  resource.parentId == principal.agentId &&
  principal.boundedDelegationChildId == resource.agentId
};

permit (principal, action == GenOS::Action::"StartMission", resource)
when {
  resource.workspaceId == context.workspaceId &&
  principal.executionMode == "orchestrator" &&
  resource.executionMode == "worker" &&
  resource.parentId == principal.agentId &&
  resource.sealedDispatchParentId == principal.agentId
};

permit (principal, action == GenOS::Action::"StartMission", resource)
when {
  principal.workspaceId == context.workspaceId &&
  resource.workspaceId == context.workspaceId &&
  principal.executionMode == "orchestrator" &&
  ((principal == resource && resource.executionMode == "orchestrator") ||
   (resource.executionMode == "worker" && resource.parentId == principal.agentId))
};
