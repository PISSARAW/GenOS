const TABLES_TENANCY = [
"-- 32. Organization, project and environment tenancy",
"CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);",
"CREATE TABLE IF NOT EXISTS environments (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, organization_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE);",
"CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')), created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(organization_id, name), FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE);",
"CREATE TABLE IF NOT EXISTS organization_memberships (principal_id TEXT NOT NULL, organization_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(principal_id, organization_id), FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE);",
"CREATE TABLE IF NOT EXISTS project_memberships (principal_id TEXT NOT NULL, project_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(principal_id, project_id), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE);",
"CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_project_name ON workspaces(project_id, name) WHERE project_id IS NOT NULL;",
"CREATE TRIGGER IF NOT EXISTS validate_workspace_project_insert",
"BEFORE INSERT ON workspaces",
" WHEN (NEW.organization_id IS NULL) <> (NEW.project_id IS NULL)",
" BEGIN SELECT RAISE(ABORT, 'workspace organization_id and project_id must be provided together'); END;",
"CREATE TRIGGER IF NOT EXISTS validate_workspace_project_update",
"BEFORE UPDATE OF organization_id, project_id ON workspaces",
" WHEN (NEW.organization_id IS NULL) <> (NEW.project_id IS NULL)",
" BEGIN SELECT RAISE(ABORT, 'workspace organization_id and project_id must be provided together'); END;",
"CREATE TRIGGER IF NOT EXISTS validate_workspace_project_owner_insert",
"BEFORE INSERT ON workspaces",
" WHEN NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id AND organization_id = NEW.organization_id)",
" BEGIN SELECT RAISE(ABORT, 'workspace project does not belong to organization'); END;",
"CREATE TRIGGER IF NOT EXISTS validate_workspace_project_owner_update",
"BEFORE UPDATE OF organization_id, project_id ON workspaces",
" WHEN NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id AND organization_id = NEW.organization_id)",
" BEGIN SELECT RAISE(ABORT, 'workspace project does not belong to organization'); END;"
];

module.exports = { TABLES_TENANCY };
