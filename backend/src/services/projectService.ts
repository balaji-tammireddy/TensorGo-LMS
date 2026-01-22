import { query, pool } from '../database/db';

export interface ProjectData {
  custom_id: string;
  name: string;
  description?: string;
  project_manager_id: number;
  start_date?: string;
  end_date?: string;
  created_by: number;
}

export interface ModuleData {
  project_id: number;
  custom_id: string;
  name: string;
  description?: string;
}

export interface TaskData {
  module_id: number;
  custom_id: string;
  name: string;
  description?: string;
  due_date?: string;
}

export interface ActivityData {
  task_id: number;
  custom_id: string;
  name: string;
  description?: string;
}

export class ProjectService {

  // --- 1. Project Creation & Team Gen ---

  static async createProject(data: ProjectData) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Validate Manager Status
      const managerRes = await client.query(
        `SELECT status FROM users WHERE id = $1`,
        [data.project_manager_id]
      );

      if (managerRes.rows.length === 0) {
        throw new Error('Project Manager not found');
      }

      const managerStatus = managerRes.rows[0].status;
      // Strict "One-Strike" Rule
      const forbiddenStatuses = ['on_notice', 'resigned', 'terminated', 'inactive'];
      if (forbiddenStatuses.includes(managerStatus)) {
        throw new Error('Cannot assign a user on notice as Project Manager');
      }

      // Check for duplicate Custom ID
      const existingProject = await client.query(
        `SELECT id FROM projects WHERE custom_id = $1`,
        [data.custom_id]
      );
      if (existingProject.rows.length > 0) {
        throw new Error(`Project with ID ${data.custom_id} already exists`);
      }

      // 2. Insert Project
      const insertRes = await client.query(
        `INSERT INTO projects (
          custom_id, name, description, project_manager_id, start_date, end_date, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          data.custom_id,
          data.name,
          data.description || null,
          data.project_manager_id,
          data.start_date || null,
          data.end_date || null,
          data.created_by
        ]
      );
      const project = insertRes.rows[0];

      // 3. Recursive Team Generation
      await this.syncProjectTeam(project.id, data.project_manager_id, client);

      await client.query('COMMIT');
      return project;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async updateProject(id: number, data: Partial<ProjectData>) {
    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name) { updates.push(`name = $${idx++}`); values.push(data.name); }
    if (data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(data.description); }
    if (data.start_date !== undefined) { updates.push(`start_date = $${idx++}`); values.push(data.start_date); }
    if (data.end_date !== undefined) { updates.push(`end_date = $${idx++}`); values.push(data.end_date); }

    // Update Manager logic with validation
    if (data.project_manager_id) {
      const managerRes = await pool.query('SELECT status FROM users WHERE id = $1', [data.project_manager_id]);
      if (managerRes.rows.length === 0) throw new Error('Project Manager not found');

      const managerStatus = managerRes.rows[0].status;
      const forbiddenStatuses = ['on_notice', 'resigned', 'terminated', 'inactive'];
      if (forbiddenStatuses.includes(managerStatus)) {
        throw new Error('Cannot assign a user on notice/inactive as Project Manager');
      }

      updates.push(`project_manager_id = $${idx++}`);
      values.push(data.project_manager_id);
    }

    // status update logic specific if passed
    // The interface ProjectData doesn't seem to have status? Let's check type.
    // Actually Controller passed "updates". 
    // Let's assume passed object keys map to DB columns.
    if ((data as any).status) { updates.push(`status = $${idx++}`); values.push((data as any).status); }

    if (updates.length === 0) return null;

    values.push(id);

    const res = await query(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return res.rows[0];
  }

  // Recursive "Tree" Algorithm
  static async syncProjectTeam(projectId: number, managerId: number, clientOrPool: any = pool) {
    // 1. Find all reports recursively
    const teamIds = await this.getReportingSubtree(managerId, clientOrPool);

    // Add the manager themselves to the team if not already
    const allMemberIds = new Set([managerId, ...teamIds]);

    // 2. Insert into project_members
    // We use ON CONFLICT DO NOTHING to avoid duplicates if re-syncing
    for (const userId of allMemberIds) {
      await clientOrPool.query(
        `INSERT INTO project_members (project_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (project_id, user_id) DO NOTHING`,
        [projectId, userId]
      );
    }
  }

  private static async getReportingSubtree(managerId: number, client: any): Promise<number[]> {
    // Find direct reports
    const res = await client.query(
      `SELECT id FROM users WHERE reporting_manager_id = $1`,
      [managerId]
    );

    let subordinates: number[] = [];

    for (const row of res.rows) {
      subordinates.push(row.id);
      // Recursion
      const grandSubordinates = await this.getReportingSubtree(row.id, client);
      subordinates = [...subordinates, ...grandSubordinates];
    }

    return subordinates;
  }

  // --- 2. Hierarchy Creation (Module/Task/Activity) ---

  static async createModule(data: ModuleData) {
    return query(
      `INSERT INTO project_modules (project_id, custom_id, name, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.project_id, data.custom_id, data.name, data.description]
    );
  }

  static async createTask(data: TaskData) {
    return query(
      `INSERT INTO project_tasks (module_id, custom_id, name, description, due_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.module_id, data.custom_id, data.name, data.description, data.due_date]
    );
  }

  static async createActivity(data: ActivityData) {
    return query(
      `INSERT INTO project_activities (task_id, custom_id, name, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.task_id, data.custom_id, data.name, data.description]
    );
  }

  // --- 3. Access Control & Cascading Revocation ---

  static async assignModuleAccess(moduleId: number, userIds: number[], grantedBy: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const userId of userIds) {
        await client.query(
          `INSERT INTO module_access (module_id, user_id, granted_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (module_id, user_id) DO NOTHING`,
          [moduleId, userId, grantedBy]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // Scenario A: Remove from Project -> User removed from project_members
  // CASCADE: Remove from all modules, tasks, activities in this project
  static async removeProjectMember(projectId: number, userId: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Delete from Project Members
      await client.query(
        `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`,
        [projectId, userId]
      );

      // 2. Cascade: Module Access
      await client.query(
        `DELETE FROM module_access 
         WHERE user_id = $1 AND module_id IN (SELECT id FROM project_modules WHERE project_id = $2)`,
        [userId, projectId]
      );

      // 3. Cascade: Task Access
      await client.query(
        `DELETE FROM task_access 
         WHERE user_id = $1 AND task_id IN (
            SELECT t.id FROM project_tasks t
            JOIN project_modules m ON t.module_id = m.id
            WHERE m.project_id = $2
         )`,
        [userId, projectId]
      );

      // 4. Cascade: Activity Access
      await client.query(
        `DELETE FROM activity_access 
         WHERE user_id = $1 AND activity_id IN (
            SELECT a.id FROM project_activities a
            JOIN project_tasks t ON a.task_id = t.id
            JOIN project_modules m ON t.module_id = m.id
            WHERE m.project_id = $2
         )`,
        [userId, projectId]
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // Scenario B: Remove from Module -> User removed from module_access
  // CASCADE: Remove from tasks in this module, activities in those tasks
  static async removeModuleAccess(moduleId: number, userId: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Delete from Module Access
      await client.query(
        `DELETE FROM module_access WHERE module_id = $1 AND user_id = $2`,
        [moduleId, userId]
      );

      // 2. Cascade: Task Access
      await client.query(
        `DELETE FROM task_access 
         WHERE user_id = $1 AND task_id IN (SELECT id FROM project_tasks WHERE module_id = $2)`,
        [userId, moduleId]
      );

      // 3. Cascade: Activity Access
      await client.query(
        `DELETE FROM activity_access 
         WHERE user_id = $1 AND activity_id IN (
            SELECT a.id FROM project_activities a
            JOIN project_tasks t ON a.task_id = t.id
            WHERE t.module_id = $2
         )`,
        [userId, moduleId]
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // --- 4. Getters with Access Control ---

  static async getProjectsForUser(userId: number, role: string) {
    // Global Viewers
    if (role === 'super_admin' || role === 'hr') {
      return query(`SELECT * FROM projects ORDER BY created_at DESC`);
    }

    // PM and Members: Show projects where they are manager OR member
    // Note: PM is technically a member due to syncProjectTeam, but explicit check is safer
    return query(
      `SELECT DISTINCT p.* FROM projects p
       LEFT JOIN project_members pm ON p.id = pm.project_id
       WHERE p.project_manager_id = $1 OR pm.user_id = $1
       ORDER BY p.created_at DESC`,
      [userId]
    );
  }

  static async getModulesForProject(projectId: number, userId: number, role: string) {
    // Global Viewers or Project Manager can see all
    const isGlobal = role === 'super_admin' || role === 'hr';

    // Check if user is PM of this specific project
    const projectCheck = await query(`SELECT project_manager_id FROM projects WHERE id = $1`, [projectId]);
    const isPM = projectCheck.rows[0]?.project_manager_id === userId;

    if (isGlobal || isPM) {
      return query(`SELECT * FROM project_modules WHERE project_id = $1 ORDER BY custom_id`, [projectId]);
    }

    // Regular Members: Only see what is in module_access
    return query(
      `SELECT m.* FROM project_modules m
       JOIN module_access ma ON m.id = ma.module_id
       WHERE m.project_id = $1 AND ma.user_id = $2
       ORDER BY m.custom_id`,
      [projectId, userId]
    );
  }

  static async getTasksForModule(moduleId: number, userId: number, role: string) {
    // We need to check if user is PM of the *parent project*
    // 1. Get Project ID from module
    const moduleRes = await query(`SELECT project_id FROM project_modules WHERE id = $1`, [moduleId]);
    if (moduleRes.rows.length === 0) return { rows: [] };
    const projectId = moduleRes.rows[0].project_id;

    const projectCheck = await query(`SELECT project_manager_id FROM projects WHERE id = $1`, [projectId]);
    const isPM = projectCheck.rows[0]?.project_manager_id === userId;
    const isGlobal = role === 'super_admin' || role === 'hr';

    if (isGlobal || isPM) {
      return query(`SELECT * FROM project_tasks WHERE module_id = $1 ORDER BY custom_id`, [moduleId]);
    }

    return query(
      `SELECT t.* FROM project_tasks t
       JOIN task_access ta ON t.id = ta.task_id
       WHERE t.module_id = $1 AND ta.user_id = $2
       ORDER BY t.custom_id`,
      [moduleId, userId]
    );
  }
}
