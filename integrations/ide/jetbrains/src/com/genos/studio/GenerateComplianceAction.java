package com.genos.studio;

import com.intellij.notification.NotificationGroupManager;
import com.intellij.notification.NotificationType;
import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.AnActionEvent;

/** Minimal action wired to the shared GenOS command contract. */
public final class GenerateComplianceAction extends AnAction {
  @Override public void actionPerformed(AnActionEvent event) {
    NotificationGroupManager.getInstance().getNotificationGroup("GenOS Studio")
      .createNotification("Use /api/ide/commands/compliance.generate to generate a report.", NotificationType.INFORMATION)
      .notify(event.getProject());
  }
}
