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
  custom_id?: string;
  name: string;
  description?: string;
}

export class ProjectService {
  private static async generateNextCustomId(table: string, prefix: string, parentColumn?: string, parentId?: number, client: any = pool): Promise<string> {
    // Filter by prefix pattern to avoid conflicts with system projects or different ID formats
    let queryStr = `SELECT custom_id FROM ${table} WHERE custom_id LIKE $1`;
    const params: any[] = [`${prefix}-%`];

    if (parentColumn && parentId !== undefined) {
      queryStr += ` AND ${parentColumn} = $2`;
      params.push(parentId);
    }

    queryStr += ` ORDER BY custom_id DESC LIMIT 1`;

    const res = await client.query(queryStr, params);
    if (res.rows.length === 0) {
      console.log(`[ProjectService] ID Generation: No previous records for ${prefix}. Starting at 001.`);
      return `${prefix}-001`;
    }

    const lastId = res.rows[0].custom_id;
    const match = lastId.match(/(\d+)$/);
    console.log(`[ProjectService] ID Generation: Last ID=${lastId}, Match=${match ? match[1] : 'null'}`);

    if (!match) {
      console.log(`[ProjectService] ID Generation: Failed to parse number from ${lastId}. Starting at 001.`);
      return `${prefix}-001`;
    }

    const nextNum = parseInt(match[1]) + 1;
    const nextId = `${prefix}-${nextNum.toString().padStart(3, '0')}`;
    console.log(`[ProjectService] ID Generation: Generated ${nextId}`);
    return nextId;
  }

  // --- 1. Project Creation & Team Gen ---

  static async createProject(data: ProjectData, creatorRole: string) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Manager Assignment Logic
      let managerId = data.project_manager_id;
      if (creatorRole === 'manager') {
        // Enforce: Manager creating project MUST be the PM
        managerId = data.created_by;
      }

      // 2. Validate Manager Status
      const managerRes = await client.query(
        `SELECT status FROM users WHERE id = $1`,
        [managerId]
      );

      if (managerRes.rows.length === 0) {
        throw new Error('Project Manager not found');
      }

      const managerStatus = managerRes.rows[0].status;
      const forbiddenStatuses = ['on_notice', 'resigned', 'terminated', 'inactive'];
      if (forbiddenStatuses.includes(managerStatus)) {
        throw new Error('Cannot assign a user on notice/inactive as Project Manager');
      }

      // Generate Custom ID
      const customId = await this.generateNextCustomId('projects', 'PRO', undefined, undefined, client);

      // 3. Insert Project
      const startDate = new Date();
      const insertRes = await client.query(
        `INSERT INTO projects (
          custom_id, name, description, project_manager_id, start_date, end_date, created_by, updated_by, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          customId,
          data.name,
          data.description || null,
          managerId,
          startDate,
          data.end_date || null,
          data.created_by,
          data.created_by,
          'active'
        ]
      );
      const project = insertRes.rows[0];

      // 4. Recursive Team Generation
      await this.syncProjectTeam(project.id, managerId, client, data.created_by);

      await client.query('COMMIT');
      return project;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async updateProject(id: number, data: Partial<ProjectData> & { status?: string }, requesterId?: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 0. Fetch Current Project State
      const currentRes = await client.query('SELECT project_manager_id, status FROM projects WHERE id = $1', [id]);
      if (currentRes.rows.length === 0) throw new Error('Project not found');
      const currentProject = currentRes.rows[0];

      // 1. Check for PM Change
      const isManagerChanging = data.project_manager_id && data.project_manager_id !== currentProject.project_manager_id;

      // 2. AUTOMATION: Check for status change to set end_date
      if (data.status && currentProject.status === 'active' && data.status !== 'active' && !data.end_date) {
        data.end_date = new Date().toISOString();
      }

      // 3. Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (data.name) { updates.push(`name = $${idx++}`); values.push(data.name); }
      if (data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(data.description); }
      if (data.start_date !== undefined) { updates.push(`start_date = $${idx++}`); values.push(data.start_date); }
      if (data.end_date !== undefined) { updates.push(`end_date = $${idx++}`); values.push(data.end_date); }

      if (data.project_manager_id) {
        const managerRes = await client.query('SELECT status FROM users WHERE id = $1', [data.project_manager_id]);
        if (managerRes.rows.length === 0) throw new Error('Project Manager not found');
        if (['on_notice', 'resigned', 'terminated', 'inactive'].includes(managerRes.rows[0].status)) {
          throw new Error('Cannot assign a user on notice/inactive as Project Manager');
        }
        updates.push(`project_manager_id = $${idx++}`);
        values.push(data.project_manager_id);
      }

      if (data.status) { updates.push(`status = $${idx++}`); values.push(data.status); }

      if (updates.length > 0) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        if (requesterId) {
          updates.push(`updated_by = $${idx++}`);
          values.push(requesterId);
        }
        values.push(id);
        const res = await client.query(`UPDATE projects SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values);
        const project = res.rows[0];

        // 4. IF PM Changed: Trigger Reset Logic
        if (isManagerChanging) {
          console.log(`[ProjectService] Triggering metadata-driven PM swap logic for project ${id}`);
          // A. Wipe all Module/Task/Activity access
          await this.wipeProjectResourceAccess(id, client);

          // B. Re-sync Project Team (Subtree)
          await this.syncProjectTeam(id, data.project_manager_id!, client, requesterId);

          // C. Re-assign NEW PM to everything
          await this.assignIrrevocableAccess(id, data.project_manager_id!, client);
        }

        await client.query('COMMIT');
        // Return full joined data including manager_name and is_pm
        return this.getProject(id, requesterId!, 'super_admin'); // We use super_admin here to bypass visibility checks for the return value
      }

      await client.query('COMMIT');
      return this.getProject(id, requesterId!, 'super_admin');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // --- Helpers for PM Swap ---
  private static async wipeProjectResourceAccess(projectId: number, client: any) {
    // 1. Module access
    await client.query(`DELETE FROM module_access WHERE module_id IN (SELECT id FROM project_modules WHERE project_id = $1)`, [projectId]);
    // 2. Task access
    await client.query(`
      DELETE FROM task_access 
      WHERE task_id IN (SELECT t.id FROM project_tasks t JOIN project_modules m ON t.module_id = m.id WHERE m.project_id = $1)
    `, [projectId]);
    // 3. Activity access
    await client.query(`
      DELETE FROM activity_access 
      WHERE activity_id IN (
        SELECT a.id FROM project_activities a 
        JOIN project_tasks t ON a.task_id = t.id 
        JOIN project_modules m ON t.module_id = m.id 
        WHERE m.project_id = $1
      )
    `, [projectId]);
  }

  private static async assignIrrevocableAccess(projectId: number, managerId: number, client: any) {
    // 1. Modules, Tasks, and Activities in one go via subqueries
    await client.query(`
      INSERT INTO module_access (module_id, user_id, granted_by, created_by, updated_by)
      SELECT id, $2, $2, $2, $2 FROM project_modules WHERE project_id = $1
      ON CONFLICT (module_id, user_id) DO NOTHING
    `, [projectId, managerId]);

    await client.query(`
      INSERT INTO task_access (task_id, user_id, granted_by, created_by, updated_by)
      SELECT t.id, $2, $2, $2, $2 FROM project_tasks t JOIN project_modules m ON t.module_id = m.id WHERE m.project_id = $1
      ON CONFLICT (task_id, user_id) DO NOTHING
    `, [projectId, managerId]);

    await client.query(`
      INSERT INTO activity_access (activity_id, user_id, granted_by, created_by, updated_by)
      SELECT a.id, $2, $2, $2, $2 FROM project_activities a JOIN project_tasks t ON a.task_id = t.id JOIN project_modules m ON t.module_id = m.id WHERE m.project_id = $1
      ON CONFLICT (activity_id, user_id) DO NOTHING
    `, [projectId, managerId]);
  }

  // --- Recursive Hierarchy Sync Logic ---
  static async syncProjectTeam(projectId: number, managerId: number, clientOrPool: any = pool, createdBy?: number) {
    if (!projectId || !managerId) return;

    console.log(`[ProjectService] syncProjectTeam: Syncing Project ${projectId} with PM ${managerId}`);

    // 1. Fetch subtree and update members in ONE query using Recursive CTE
    await clientOrPool.query(`
      WITH RECURSIVE subordinates AS (
        SELECT id FROM users WHERE id = $2
        UNION ALL
        SELECT u.id FROM users u
        INNER JOIN subordinates s ON s.id = u.reporting_manager_id
      )
      INSERT INTO project_members (project_id, user_id, created_by, updated_by)
      SELECT $1, id, $3, $3 FROM subordinates
      ON CONFLICT (project_id, user_id) DO NOTHING
    `, [projectId, managerId, createdBy || managerId]);

    // 2. Remove users who are no longer in the subtree (if hierarchy changed)
    await clientOrPool.query(`
      DELETE FROM project_members 
      WHERE project_id = $1 
      AND user_id NOT IN (
        WITH RECURSIVE subordinates AS (
          SELECT id FROM users WHERE id = $2
          UNION ALL
          SELECT u.id FROM users u
          INNER JOIN subordinates s ON s.id = u.reporting_manager_id
        )
        SELECT id FROM subordinates
      )
    `, [projectId, managerId]);

    // 3. Cascade Revocation: Remove resource access for anyone no longer in the project
    // This strictly enforces the rule: Project Team = PM Subordinates Only
    const projectMemberFilter = `SELECT user_id FROM project_members WHERE project_id = $1`;

    await clientOrPool.query(`
      DELETE FROM activity_access 
      WHERE activity_id IN (
        SELECT a.id FROM project_activities a
        JOIN project_tasks t ON a.task_id = t.id
        JOIN project_modules m ON t.module_id = m.id
        WHERE m.project_id = $1
      )
      AND user_id NOT IN (${projectMemberFilter})
    `, [projectId]);

    await clientOrPool.query(`
      DELETE FROM task_access 
      WHERE task_id IN (
        SELECT t.id FROM project_tasks t
        JOIN project_modules m ON t.module_id = m.id
        WHERE m.project_id = $1
      )
      AND user_id NOT IN (${projectMemberFilter})
    `, [projectId]);

    await clientOrPool.query(`
      DELETE FROM module_access 
      WHERE module_id IN (SELECT id FROM project_modules WHERE project_id = $1)
      AND user_id NOT IN (${projectMemberFilter})
    `, [projectId]);
  }

  /**
   * Global Sync: Re-runs project team gathering for ALL active projects.
   * This ensures the project_members table and all access tables accurately 
   * reflect the reporting hierarchy, self-healing any missed inheritance.
   */
  static async syncAllProjectTeams(clientOrPool: any = pool) {
    console.log(`[ProjectService] syncAllProjectTeams: Starting global re-sync for all active projects...`);
    try {
      const res = await clientOrPool.query("SELECT id, project_manager_id FROM projects WHERE status = 'active'");
      console.log(`[ProjectService] syncAllProjectTeams: Found ${res.rows.length} projects to sync.`);

      for (const project of res.rows) {
        if (project.project_manager_id) {
          await this.syncProjectTeam(project.id, project.project_manager_id, clientOrPool);
        }
      }
      console.log(`[ProjectService] syncAllProjectTeams: Global re-sync completed.`);
    } catch (error) {
      console.error(`[ProjectService] syncAllProjectTeams: Error:`, error);
      throw error;
    }
  }

  // NEW: Reset all resource access when PM changes
  static async resetProjectResourcesToNewManager(projectId: number, newManagerId: number, client: any) {
    console.log(`[ProjectService] Resetting resources for Project ${projectId} to New Manager ${newManagerId}`);

    // 1. Clear existing access for this project
    // Modules
    await client.query(`
      DELETE FROM module_access 
      WHERE module_id IN (SELECT id FROM project_modules WHERE project_id = $1)
    `, [projectId]);

    // Tasks
    await client.query(`
      DELETE FROM task_access 
      WHERE task_id IN (
        SELECT t.id FROM project_tasks t 
        JOIN project_modules m ON t.module_id = m.id 
        WHERE m.project_id = $1
      )
    `, [projectId]);

    // Activities
    await client.query(`
      DELETE FROM activity_access 
      WHERE activity_id IN (
        SELECT a.id FROM project_activities a 
        JOIN project_tasks t ON a.task_id = t.id 
        JOIN project_modules m ON t.module_id = m.id 
        WHERE m.project_id = $1
      )
    `, [projectId]);

    // 2. Assign New Manager to ALL modules
    await client.query(`
      INSERT INTO module_access (module_id, user_id, granted_by, created_by, updated_by)
      SELECT id, $2, $2, $2, $2 FROM project_modules WHERE project_id = $1
    `, [projectId, newManagerId]);

    // 3. Assign New Manager to ALL tasks
    await client.query(`
      INSERT INTO task_access (task_id, user_id, granted_by, created_by, updated_by)
      SELECT t.id, $2, $2, $2, $2 
      FROM project_tasks t
      JOIN project_modules m ON t.module_id = m.id
      WHERE m.project_id = $1
    `, [projectId, newManagerId]);

    // 4. Assign New Manager to ALL activities
    await client.query(`
      INSERT INTO activity_access (activity_id, user_id, granted_by, created_by, updated_by)
      SELECT a.id, $2, $2, $2, $2 
      FROM project_activities a
      JOIN project_tasks t ON a.task_id = t.id
      JOIN project_modules m ON t.module_id = m.id
      WHERE m.project_id = $1
    `, [projectId, newManagerId]);
  }

  protected static async getReportingSubtree(managerId: number, client: any): Promise<number[]> {
    const res = await client.query(`
      WITH RECURSIVE subordinates AS (
        SELECT id FROM users WHERE reporting_manager_id = $1
        UNION ALL
        SELECT u.id FROM users u
        INNER JOIN subordinates s ON s.id = u.reporting_manager_id
      )
      SELECT id FROM subordinates
    `, [managerId]);

    return res.rows.map((row: any) => row.id);
  }

  // --- 2. Hierarchy Creation (Module/Task/Activity) ---

  static async createModule(data: ModuleData, assigneeIds?: number[], createdBy?: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Generate Custom ID automatically
      const customId = await this.generateNextCustomId('project_modules', 'MOD', 'project_id', data.project_id, client);

      const res = await client.query(
        `INSERT INTO project_modules (project_id, custom_id, name, description, created_by, updated_by)
             VALUES ($1, $2, $3, $4, $5, $5) RETURNING *`,
        [data.project_id, customId, data.name, data.description || null, createdBy]
      );
      const module = res.rows[0];

      // Assign access if provided
      if (assigneeIds && assigneeIds.length > 0 && createdBy) {
        await this.assignModuleAccess(module.id, assigneeIds, createdBy, client);
      }

      await client.query('COMMIT');
      return module;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async updateModule(id: number, data: Partial<ModuleData> & { assigneeIds?: number[] }, userId: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (data.name) { updates.push(`name = $${idx++}`); values.push(data.name); }
      if (data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(data.description); }
      if (data.custom_id) { updates.push(`custom_id = $${idx++}`); values.push(data.custom_id); }

      if (updates.length > 0 || userId) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        if (userId) {
          updates.push(`updated_by = $${idx++}`);
          values.push(userId);
        }

        values.push(id);
        await client.query(`UPDATE project_modules SET ${updates.join(', ')} WHERE id = $${idx}`, values);
      }

      if (data.assigneeIds !== undefined) {
        const incomingIds = data.assigneeIds.map(id => String(id));
        console.log(`[ProjectService] updateModule: id=${id}, incomingIds=${JSON.stringify(incomingIds)}`);

        // 1. Get current users to identify who is being removed
        const currentRes = await client.query('SELECT user_id FROM module_access WHERE module_id = $1', [id]);
        const currentUserIds = currentRes.rows.map(r => String(r.user_id));
        console.log(`[ProjectService] updateModule: currentUserIds=${JSON.stringify(currentUserIds)}`);

        const removedUserIds = currentUserIds.filter(uid => !incomingIds.includes(uid));
        console.log(`[ProjectService] updateModule: Removed user IDs=${JSON.stringify(removedUserIds)}`);

        // 2. Clear old module access
        await client.query('DELETE FROM module_access WHERE module_id = $1', [id]);

        // 3. Re-assign new module access
        if (data.assigneeIds.length > 0) {
          await this.assignModuleAccess(id, data.assigneeIds, userId, client);
        }

        // 4. Cascade Revocation for removed users
        if (removedUserIds.length > 0) {
          // Task Access
          await client.query(
            `DELETE FROM task_access 
             WHERE user_id = ANY($1) AND task_id IN (SELECT id FROM project_tasks WHERE module_id = $2)`,
            [removedUserIds, id]
          );

          // Activity Access
          await client.query(
            `DELETE FROM activity_access 
             WHERE user_id = ANY($1) AND activity_id IN (
                SELECT a.id FROM project_activities a
                JOIN project_tasks t ON a.task_id = t.id
                WHERE t.module_id = $2
             )`,
            [removedUserIds, id]
          );
        }
      }

      await client.query('COMMIT');
      const res = await query('SELECT * FROM project_modules WHERE id = $1', [id]);
      return res.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async deleteModule(id: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tasks = await client.query('SELECT id FROM project_tasks WHERE module_id = $1', [id]);
      const taskIds = tasks.rows.map(r => r.id);

      if (taskIds.length > 0) {
        const activities = await client.query('SELECT id FROM project_activities WHERE task_id = ANY($1)', [taskIds]);
        const activityIds = activities.rows.map(r => r.id);

        if (activityIds.length > 0) {
          await client.query('DELETE FROM project_entries WHERE activity_id = ANY($1)', [activityIds]);
          await client.query('DELETE FROM activity_access WHERE activity_id = ANY($1)', [activityIds]);
          await client.query('DELETE FROM project_activities WHERE id = ANY($1)', [activityIds]);
        }

        await client.query('DELETE FROM project_entries WHERE task_id = ANY($1)', [taskIds]);
        await client.query('DELETE FROM task_access WHERE task_id = ANY($1)', [taskIds]);
        await client.query('DELETE FROM project_tasks WHERE id = ANY($1)', [taskIds]);
      }

      await client.query('DELETE FROM project_entries WHERE module_id = $1', [id]);
      await client.query('DELETE FROM module_access WHERE module_id = $1', [id]);
      await client.query('DELETE FROM project_modules WHERE id = $1', [id]);

      await client.query('COMMIT');
      return { success: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async createTask(data: TaskData, assigneeIds?: number[], createdBy?: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Generate Custom ID automatically
      const customId = await this.generateNextCustomId('project_tasks', 'TSK', 'module_id', data.module_id, client);

      const res = await client.query(
        `INSERT INTO project_tasks (module_id, custom_id, name, description, due_date, created_by, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING *`,
        [data.module_id, customId, data.name, data.description || null, data.due_date || null, createdBy]
      );
      const task = res.rows[0];

      if (assigneeIds && assigneeIds.length > 0 && createdBy) {
        await this.assignTaskAccess(task.id, assigneeIds, createdBy, client);
      }

      await client.query('COMMIT');
      return task;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async createActivity(data: ActivityData, assigneeIds?: number[], createdBy?: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Get Parent Task's Custom ID to use as prefix
      const taskRes = await client.query('SELECT custom_id FROM project_tasks WHERE id = $1', [data.task_id]);
      if (taskRes.rows.length === 0) throw new Error('Parent task not found');
      const taskCustomId = taskRes.rows[0].custom_id;

      // 2. Generate Custom ID (e.g. TSK-001-01)
      const customId = data.custom_id || await this.generateNextCustomId('project_activities', taskCustomId, 'task_id', data.task_id, client);

      const res = await client.query(
        `INSERT INTO project_activities (task_id, custom_id, name, description, created_by, updated_by)
             VALUES ($1, $2, $3, $4, $5, $5) RETURNING *`,
        [data.task_id, customId, data.name, data.description || null, createdBy]
      );
      const activity = res.rows[0];

      if (assigneeIds && assigneeIds.length > 0 && createdBy) {
        await this.assignActivityAccess(activity.id, assigneeIds, createdBy, client);
      }

      await client.query('COMMIT');
      return activity;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // --- 3. Access Control & Cascading Revocation ---

  static async assignModuleAccess(moduleId: number, userIds: number[], grantedBy: number, clientOrPool: any = pool) {
    // clientOrPool allows participating in existing transaction
    for (const userId of userIds) {
      await clientOrPool.query(
        `INSERT INTO module_access (module_id, user_id, granted_by, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (module_id, user_id) DO NOTHING`,
        [moduleId, userId, grantedBy, grantedBy, grantedBy]
      );
    }
  }

  static async assignTaskAccess(taskId: number, userIds: number[], grantedBy: number, clientOrPool: any = pool) {
    for (const userId of userIds) {
      await clientOrPool.query(
        `INSERT INTO task_access (task_id, user_id, granted_by, created_by, updated_by)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (task_id, user_id) DO NOTHING`,
        [taskId, userId, grantedBy, grantedBy, grantedBy]
      );
    }
  }

  static async updateTask(id: number, data: Partial<TaskData> & { assigneeIds?: number[] }, userId: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (data.name) { updates.push(`name = $${idx++}`); values.push(data.name); }
      if (data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(data.description); }
      if (data.custom_id) { updates.push(`custom_id = $${idx++}`); values.push(data.custom_id); }
      if (data.due_date !== undefined) { updates.push(`due_date = $${idx++}`); values.push(data.due_date); }


      if (updates.length > 0 || userId) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        if (userId) {
          updates.push(`updated_by = $${idx++}`);
          values.push(userId);
        }

        values.push(id);
        await client.query(`UPDATE project_tasks SET ${updates.join(', ')} WHERE id = $${idx}`, values);
      }

      if (data.assigneeIds !== undefined) {
        const incomingIds = data.assigneeIds.map(id => String(id));
        console.log(`[ProjectService] updateTask: id=${id}, incomingIds=${JSON.stringify(incomingIds)}`);

        // 1. Get current users to identify who is being removed
        const currentRes = await client.query('SELECT user_id FROM task_access WHERE task_id = $1', [id]);
        const currentUserIds = currentRes.rows.map(r => String(r.user_id));
        console.log(`[ProjectService] updateTask: currentUserIds=${JSON.stringify(currentUserIds)}`);

        const removedUserIds = currentUserIds.filter(uid => !incomingIds.includes(uid));
        console.log(`[ProjectService] updateTask: Removed user IDs=${JSON.stringify(removedUserIds)}`);

        // 2. Clear old task access
        await client.query('DELETE FROM task_access WHERE task_id = $1', [id]);

        // 3. Re-assign new task access
        if (data.assigneeIds.length > 0) {
          await this.assignTaskAccess(id, data.assigneeIds, userId, client);
        }

        // 4. Cascade Revocation for removed users: Activities
        if (removedUserIds.length > 0) {
          await client.query(
            `DELETE FROM activity_access 
             WHERE user_id = ANY($1) AND activity_id IN (
                SELECT a.id FROM project_activities a
                WHERE a.task_id = $2
             )`,
            [removedUserIds, id]
          );
        }
      }

      await client.query('COMMIT');
      const res = await query('SELECT * FROM project_tasks WHERE id = $1', [id]);
      return res.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async updateActivity(id: number, data: Partial<ActivityData> & { assigneeIds?: number[] }, userId: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (data.name) { updates.push(`name = $${idx++}`); values.push(data.name); }
      if (data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(data.description); }
      if (data.custom_id) { updates.push(`custom_id = $${idx++}`); values.push(data.custom_id); }

      if (updates.length > 0 || userId) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        if (userId) {
          updates.push(`updated_by = $${idx++}`);
          values.push(userId);
        }

        values.push(id);
        await client.query(`UPDATE project_activities SET ${updates.join(', ')} WHERE id = $${idx}`, values);
      }

      if (data.assigneeIds !== undefined) {
        console.log(`[ProjectService] updateActivity: assigneeIds=${JSON.stringify(data.assigneeIds)}`);
        // Clear old activity access
        await client.query('DELETE FROM activity_access WHERE activity_id = $1', [id]);

        // Re-assign new activity access
        if (data.assigneeIds.length > 0) {
          await this.assignActivityAccess(id, data.assigneeIds, userId, client);
        }
      }

      await client.query('COMMIT');
      return { success: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async assignActivityAccess(activityId: number, userIds: number[], grantedBy: number, clientOrPool: any = pool) {
    for (const userId of userIds) {
      await clientOrPool.query(
        `INSERT INTO activity_access (activity_id, user_id, granted_by, created_by, updated_by)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (activity_id, user_id) DO NOTHING`,
        [activityId, userId, grantedBy, grantedBy, grantedBy]
      );
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

  static async getProject(projectId: number, userId: number, role: string) {
    const isGlobalViewer = role === 'super_admin';

    let queryStr = `
      SELECT p.*, 
             COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as manager_name,
             (p.project_manager_id = $1) as is_pm,
             EXISTS (SELECT 1 FROM project_members WHERE project_id = p.id AND user_id = $1) as is_member
      FROM projects p 
      LEFT JOIN users u ON p.project_manager_id = u.id
      WHERE p.id = $2
    `;

    if (!isGlobalViewer) {
      // STRICT: Only the Project Manager or a direct Team Member can access
      queryStr = `
        SELECT p.*, 
               COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as manager_name,
               (p.project_manager_id = $1) as is_pm,
               EXISTS (SELECT 1 FROM project_members WHERE project_id = p.id AND user_id = $1) as is_member
        FROM projects p 
        LEFT JOIN users u ON p.project_manager_id = u.id
        WHERE p.id = $2
        AND (
          p.project_manager_id = $1
          OR EXISTS (SELECT 1 FROM project_members WHERE project_id = p.id AND user_id = $1)
        )
      `;
    }

    const res = await query(queryStr, [userId, projectId]);
    if (res.rows.length === 0) throw new Error('Project not found or access denied');
    return res.rows[0];
  }

  static async getProjectsForUser(userId: number, role: string) {
    // Global Viewers
    if (role === 'super_admin') {
      return query(
        `SELECT p.*, 
                COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as manager_name,
                (p.project_manager_id = $1) as is_pm,
                EXISTS (SELECT 1 FROM project_members WHERE project_id = p.id AND user_id = $1) as is_member
         FROM projects p 
         LEFT JOIN users u ON p.project_manager_id = u.id
         ORDER BY p.created_at DESC`,
        [userId]
      );
    }

    // PM and Members: Show ONLY projects where they are the PM or are added as a member
    // Note: Subordinates are automatically added as members via syncAllProjectTeams, 
    // but higher authorities are not, correctly excluding them from the "My Projects" list.
    console.log(`[ProjectService] getProjectsForUser: userId=${userId}, role=${role} - Executing strict PM/Member visibility query`);
    const res = await query(
      `SELECT p.*, 
              COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as manager_name,
              (p.project_manager_id = $1) as is_pm,
              EXISTS (SELECT 1 FROM project_members WHERE project_id = p.id AND user_id = $1) as is_member
       FROM projects p
       LEFT JOIN users u ON p.project_manager_id = u.id
       WHERE 
          p.project_manager_id = $1
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $1)
       ORDER BY p.created_at DESC`,
      [userId]
    );
    console.log(`[ProjectService] getProjectsForUser: Found ${res.rows.length} projects`);
    return res;
  }

  static async getModulesForProject(projectId: number, userId: number, role: string) {
    const isGlobal = role === 'super_admin';

    // 1. Check basic access (PM, Member, or logged time)
    const projectCheck = await query(`
      SELECT 1 FROM projects p
      WHERE p.id = $1::integer AND (
        p.project_manager_id = $2::integer
        OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id::integer AND pm.user_id = $2::integer)
        OR EXISTS (SELECT 1 FROM timesheet_entries te WHERE te.project_id = p.id::integer AND te.user_id = $2::integer)
        OR $3::boolean = true
      )
    `, [projectId, userId, isGlobal]);

    if (projectCheck.rows.length === 0 && !isGlobal) {
      throw new Error('Access denied: You do not have access to this project');
    }

    // Common user aggregator for both branches
    const assignedUsersSubquery = `
    (SELECT json_agg(u_agg) FROM (
      SELECT u.id, 
             COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as name,
             UPPER(LEFT(COALESCE(u.first_name, ''), 1)) || UPPER(LEFT(COALESCE(u.last_name, ''), 1)) as initials,
             CASE WHEN u.id::integer = p2.project_manager_id::integer THEN 0 ELSE 1 END as sort_order
      FROM module_access ma 
      JOIN users u ON ma.user_id = u.id 
      JOIN project_modules pm2 ON ma.module_id = pm2.id
      JOIN projects p2 ON pm2.project_id = p2.id
      WHERE ma.module_id = m.id
      UNION
      SELECT u3.id, 
             COALESCE(u3.first_name, '') || ' ' || COALESCE(u3.last_name, '') as name,
             UPPER(LEFT(COALESCE(u3.first_name, ''), 1)) || UPPER(LEFT(COALESCE(u3.last_name, ''), 1)) as initials,
             0 as sort_order
      FROM projects p3
      JOIN users u3 ON p3.project_manager_id = u3.id
      WHERE p3.id = m.project_id
      ORDER BY sort_order, name
    ) u_agg) as assigned_users
  `;

    // PM and Admins see ALL modules in the project
    const isPMCount = await query(`SELECT 1 FROM projects WHERE id = $1 AND project_manager_id = $2`, [projectId, userId]);
    const isPM = isPMCount.rows.length > 0 || isGlobal;

    if (isPM) {
      return query(`
      SELECT m.*, ${assignedUsersSubquery}
      FROM project_modules m 
      WHERE m.project_id = $1::integer 
      ORDER BY m.custom_id`, [projectId]
      );
    }

    // Regular Members: Show modules they have explicit access to OR have logged time to
    return query(
      `SELECT DISTINCT m.id, m.project_id, m.custom_id, m.name, m.description, m.status, m.created_at, m.updated_at, ${assignedUsersSubquery}
       FROM project_modules m
       LEFT JOIN module_access ma ON m.id = ma.module_id
       LEFT JOIN timesheet_entries te ON m.id = te.module_id
       WHERE m.project_id = $1::integer 
       AND (ma.user_id = $2::integer OR te.user_id = $2::integer)
       ORDER BY m.custom_id`,
      [projectId, userId]
    );
  }


  static async getTasksForModule(moduleId: number, userId: number, role: string) {
    const isGlobal = role === 'super_admin';

    // 1. Get the parent project ID and PM ID
    const projectInfo = await query(`
      SELECT p.id as project_id, p.project_manager_id FROM projects p
      JOIN project_modules m ON p.id = m.project_id
      WHERE m.id = $1
    `, [moduleId]);

    if (projectInfo.rows.length === 0) {
      // If module doesn't exist, return empty (prevents crashing edit form)
      return { rows: [] };
    }

    const { project_id, project_manager_id } = projectInfo.rows[0];

    // 2. Check access
    const hasAccess = await query(`
      SELECT 1 FROM projects p
      WHERE p.id = $1::integer AND (
        p.project_manager_id = $2::integer
        OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2::integer)
        OR EXISTS (SELECT 1 FROM timesheet_entries te WHERE te.module_id = $3::integer AND te.user_id = $2::integer)
        OR $4::boolean = true
      )
    `, [project_id, userId, moduleId, isGlobal]);

    if (hasAccess.rows.length === 0 && !isGlobal) {
      throw new Error('Access denied: You do not have access to this project');
    }

    const isPM = project_manager_id === userId || isGlobal;

    // Common user aggregator
    const assignedUsersSubquery = `
      (SELECT json_agg(u_agg) FROM (
        SELECT u.id, 
               COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as name,
               UPPER(LEFT(COALESCE(u.first_name, ''), 1)) || UPPER(LEFT(COALESCE(u.last_name, ''), 1)) as initials,
               CASE WHEN u.id::integer = $3::integer THEN 0 ELSE 1 END as sort_order
        FROM task_access ta2
        JOIN users u ON ta2.user_id = u.id 
        WHERE ta2.task_id = t.id
        UNION
        SELECT u3.id, 
               COALESCE(u3.first_name, '') || ' ' || COALESCE(u3.last_name, '') as name,
               UPPER(LEFT(COALESCE(u3.first_name, ''), 1)) || UPPER(LEFT(COALESCE(u3.last_name, ''), 1)) as initials,
               0 as sort_order
        FROM users u3
        WHERE u3.id::integer = $3::integer
        ORDER BY sort_order, name
      ) u_agg) as assigned_users
    `;

    if (isPM) {
      return query(`
        SELECT t.*, 
               EXISTS (SELECT 1 FROM task_access ta WHERE ta.task_id = t.id AND ta.user_id = $2::integer) as is_assigned,
               ${assignedUsersSubquery}
        FROM project_tasks t 
        WHERE t.module_id = $1::integer
        ORDER BY t.custom_id`,
        [moduleId, userId, project_manager_id]
      );
    }

    // Regular Members: Show tasks they have access to OR have logged time to
    return query(
      `SELECT DISTINCT t.id, t.module_id, t.custom_id, t.name, t.description, t.status, t.due_date, t.created_at, t.updated_at, true as is_assigned,
              ${assignedUsersSubquery}
       FROM project_tasks t
       LEFT JOIN task_access ta ON t.id = ta.task_id
       LEFT JOIN timesheet_entries te ON t.id = te.task_id
       WHERE t.module_id = $1::integer
       AND (ta.user_id = $2::integer OR te.user_id = $2::integer)
       ORDER BY t.custom_id`,
      [moduleId, userId, project_manager_id]
    );
  }

  static async getActivitiesForTask(taskId: number, userId: number, role: string) {
    const isGlobal = role === 'super_admin';

    // 1. Get parent info
    const projectInfo = await query(`
      SELECT p.id as project_id, p.project_manager_id FROM projects p
      JOIN project_modules m ON p.id = m.project_id
      JOIN project_tasks t ON m.id = t.module_id
      WHERE t.id = $1
    `, [taskId]);

    if (projectInfo.rows.length === 0) {
      return { rows: [] };
    }

    const { project_id, project_manager_id } = projectInfo.rows[0];

    // 2. Check access
    const hasAccess = await query(`
      SELECT 1 FROM projects p
      WHERE p.id = $1::integer AND (
        p.project_manager_id = $2::integer
        OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2::integer)
        OR EXISTS (SELECT 1 FROM timesheet_entries te WHERE te.task_id = $3::integer AND te.user_id = $2::integer)
        OR $4::boolean = true
      )
    `, [project_id, userId, taskId, isGlobal]);

    if (hasAccess.rows.length === 0 && !isGlobal) {
      throw new Error('Access denied: You do not have access to this project');
    }

    const isPM = project_manager_id === userId || isGlobal;

    // Common user aggregator
    const assignedUsersSubquery = `
      (SELECT json_agg(u_agg) FROM (
        SELECT u.id, 
               COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as name,
               UPPER(LEFT(COALESCE(u.first_name, ''), 1)) || UPPER(LEFT(COALESCE(u.last_name, ''), 1)) as initials,
               CASE WHEN u.id::integer = $3::integer THEN 0 ELSE 1 END as sort_order
        FROM activity_access aa2
        JOIN users u ON aa2.user_id = u.id 
        WHERE aa2.activity_id = a.id
        UNION
        SELECT u3.id, 
               COALESCE(u3.first_name, '') || ' ' || COALESCE(u3.last_name, '') as name,
               UPPER(LEFT(COALESCE(u3.first_name, ''), 1)) || UPPER(LEFT(COALESCE(u3.last_name, ''), 1)) as initials,
               0 as sort_order
        FROM users u3
        WHERE u3.id::integer = $3::integer
        ORDER BY sort_order, name
      ) u_agg) as assigned_users
    `;

    if (isPM) {
      return query(`
        SELECT a.*,
               EXISTS (SELECT 1 FROM activity_access aa WHERE aa.activity_id = a.id AND aa.user_id = $2::integer) as is_assigned,
               ${assignedUsersSubquery}
        FROM project_activities a
        WHERE a.task_id = $1::integer
        ORDER BY a.custom_id`,
        [taskId, userId, project_manager_id]
      );
    }

    // Regular Members: Show activities they have access to OR have logged time to
    return query(`
       SELECT DISTINCT a.id, a.task_id, a.custom_id, a.name, a.description, a.status, a.created_at, a.updated_at,
              ${assignedUsersSubquery}
       FROM project_activities a
       LEFT JOIN activity_access aa ON a.id = aa.activity_id
       LEFT JOIN timesheet_entries te ON a.id = te.activity_id
       WHERE a.task_id = $1::integer
       AND (aa.user_id = $2::integer OR te.user_id = $2::integer)
       ORDER BY a.custom_id`,
      [taskId, userId, project_manager_id]
    );
  }

  // --- 5. Access List Getters (for Dropdowns) ---

  static async getAccessList(level: 'project' | 'module' | 'task' | 'activity', id: number) {
    if (level === 'project') {
      // Robust Team Retrieval: Project Members Table + Current PM (safety fallback)
      // This ensures that anyone added to the project (manually or via hierarchy) is visible
      const res = await query(`
        SELECT DISTINCT u.id, u.emp_id as "empId", 
               COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as name, 
               u.user_role as role,
               COALESCE(u.email, '') as email,
               COALESCE(u.designation, 'N/A') as designation,
               COALESCE(u.department, 'N/A') as department,
               CASE WHEN u.id = p.project_manager_id THEN true ELSE false END as is_pm
        FROM (
          SELECT user_id FROM project_members WHERE project_id = $1
          UNION
          SELECT project_manager_id as user_id FROM projects WHERE id = $1
        ) as members
        JOIN users u ON members.user_id = u.id
        CROSS JOIN projects p 
        WHERE p.id = $1
        ORDER BY name
      `, [id]);

      console.log(`[ProjectService] View Team: Returning ${res.rows.length} members for Project ${id}`);
      return res.rows;
    } else if (level === 'module') {
      // 1. Get Module Access + Project Manager
      const res = await query(`
        SELECT u.id, u.emp_id as "empId", 
               COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as name, 
               u.user_role as role,
               COALESCE(u.email, '') as email,
               COALESCE(u.designation, 'N/A') as designation,
               COALESCE(u.department, 'N/A') as department,
               CASE WHEN u.id = p.project_manager_id THEN true ELSE false END as is_pm
        FROM project_modules m
        JOIN projects p ON m.project_id = p.id
        JOIN users u ON u.id = p.project_manager_id
        WHERE m.id = $1
        
        UNION
        
        SELECT u.id, u.emp_id as "empId", 
               COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as name, 
               u.user_role as role,
               COALESCE(u.email, '') as email,
               COALESCE(u.designation, 'N/A') as designation,
               COALESCE(u.department, 'N/A') as department,
               false as is_pm
        FROM module_access ma
        JOIN users u ON ma.user_id = u.id
        WHERE ma.module_id = $1
        ORDER BY name`, [id]);
      return res.rows;
    } else if (level === 'task') {
      // Cascade Rule: For a TASK, show only users who have access to the parent MODULE

      // 1. Get Parent Module ID
      const tRes = await query(`SELECT module_id FROM project_tasks WHERE id = $1`, [id]);
      if (tRes.rows.length === 0) return [];
      const moduleId = tRes.rows[0].module_id;

      // 2. Return users who have ACCESS to the parent module
      const res = await query(
        `SELECT DISTINCT u.id, u.emp_id as "empId", 
                COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as name, 
                u.user_role as role,
                COALESCE(u.email, '') as email,
                COALESCE(u.designation, 'N/A') as designation,
                COALESCE(u.department, 'N/A') as department
         FROM module_access ma
         JOIN users u ON ma.user_id = u.id
         WHERE ma.module_id = $1
         ORDER BY name`,
        [moduleId]
      );
      return res.rows;

    } else if (level === 'activity') {
      // Cascade Rule: For an ACTIVITY, show only users who have access to the parent TASK

      // 1. Get Parent Task ID
      const aRes = await query(`SELECT task_id FROM project_activities WHERE id = $1`, [id]);
      if (aRes.rows.length === 0) return [];
      const taskId = aRes.rows[0].task_id;

      // 2. Return users who have ACCESS to the parent task
      const res = await query(
        `SELECT DISTINCT u.id, u.emp_id as "empId", 
                COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as name, 
                u.user_role as role,
                COALESCE(u.email, '') as email,
                COALESCE(u.designation, 'N/A') as designation,
                COALESCE(u.department, 'N/A') as department
         FROM task_access ta
         JOIN users u ON ta.user_id = u.id
         WHERE ta.task_id = $1
         ORDER BY name`,
        [taskId]
      );
      return res.rows;
    }
    return [];
  }

  static async toggleAccess(level: 'module' | 'task' | 'activity', targetId: number, userId: number, action: 'add' | 'remove', requestedBy: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 0. Status Check: Management actions only allowed for ACTIVE projects
      let statusQuery = '';
      if (level === 'module') {
        statusQuery = `SELECT p.status FROM project_modules m JOIN projects p ON m.project_id = p.id WHERE m.id = $1`;
      } else if (level === 'task') {
        statusQuery = `SELECT p.status FROM project_tasks t JOIN project_modules m ON t.module_id = m.id JOIN projects p ON m.project_id = p.id WHERE t.id = $1`;
      } else if (level === 'activity') {
        statusQuery = `SELECT p.status FROM project_activities a JOIN project_tasks t ON a.task_id = t.id JOIN project_modules m ON t.module_id = m.id JOIN projects p ON m.project_id = p.id WHERE a.id = $1`;
      }

      const statusRes = await client.query(statusQuery, [targetId]);
      if (statusRes.rows.length === 0 || statusRes.rows[0].status !== 'active') {
        throw new Error('Action denied: Management actions are only allowed when the project status is Active.');
      }

      console.log(`[ACCESS_TRACE] Start: level=${level}, targetId=${targetId}, userId=${userId}, action=${action}`);

      const table = `${level}_access`;
      const idColumn = `${level}_id`;

      // Explicitly cast to numbers just in case
      const tId = Number(targetId);
      const uId = Number(userId);

      if (action === 'add') {
        console.log(`[ACCESS_TRACE] Adding ${uId} to ${table} for ${idColumn}=${tId}`);
        const result = await client.query(
          `INSERT INTO ${table} (${idColumn}, user_id, granted_by, created_by, updated_by)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (${idColumn}, user_id) DO NOTHING`,
          [tId, uId, requestedBy, requestedBy, requestedBy]
        );
        console.log(`[ACCESS_TRACE] Add result:`, result.rowCount);
      } else {
        // Validation: Prevent removing the Project Manager
        let pmCheckQuery = '';
        if (level === 'module') {
          pmCheckQuery = `SELECT p.project_manager_id FROM project_modules m JOIN projects p ON m.project_id = p.id WHERE m.id = $1`;
        } else if (level === 'task') {
          pmCheckQuery = `SELECT p.project_manager_id FROM project_tasks t JOIN project_modules m ON t.module_id = m.id JOIN projects p ON m.project_id = p.id WHERE t.id = $1`;
        } else if (level === 'activity') {
          pmCheckQuery = `SELECT p.project_manager_id FROM project_activities a JOIN project_tasks t ON a.task_id = t.id JOIN project_modules m ON t.module_id = m.id JOIN projects p ON m.project_id = p.id WHERE a.id = $1`;
        }

        if (pmCheckQuery) {
          const pmRes = await client.query(pmCheckQuery, [tId]);
          if (pmRes.rows.length > 0 && String(pmRes.rows[0].project_manager_id) === String(uId)) {
            console.warn(`[ACCESS_TRACE] Attempted to remove PM ${uId} from ${level} ${tId}. Blocked.`);
            // We return success=true (or could throw error) but do NOT Perform the delete.
            // Returning success avoids frontend error alerts for a "no-op" which is often desired UI behavior.
            // However, user asked for validation, throwing might be clearer if it was an intentional malicious call.
            // Given the context is "dropdown fix", silent ignore is safer for UI state sync.
            await client.query('COMMIT');
            return { success: true, updatedUsers: [] }; // Will trigger refetch/return list in next block
          }
        }

        // Remove
        console.log(`[ACCESS_TRACE] Removing ${uId} from ${table} for ${idColumn}=${tId}`);
        const result = await client.query(
          `DELETE FROM ${table} WHERE ${idColumn} = $1 AND user_id = $2`,
          [tId, uId]
        );
        console.log(`[ACCESS_TRACE] Remove result:`, result.rowCount);

        // Cascading Revocation
        if (level === 'module') {
          // Remove from all tasks in this module
          await client.query(
            `DELETE FROM task_access 
             WHERE user_id = $1 AND task_id IN (SELECT id FROM project_tasks WHERE module_id = $2)`,
            [userId, targetId]
          );
          // Remove from all activities in this module
          await client.query(
            `DELETE FROM activity_access 
             WHERE user_id = $1 AND activity_id IN (
                SELECT a.id FROM project_activities a
                JOIN project_tasks t ON a.task_id = t.id
                WHERE t.module_id = $2
             )`,
            [userId, targetId]
          );
        } else if (level === 'task') {
          // Remove from all activities in this task
          await client.query(
            `DELETE FROM activity_access 
             WHERE user_id = $1 AND activity_id IN (SELECT id FROM project_activities WHERE task_id = $2)`,
            [userId, targetId]
          );
        }
      }

      await client.query('COMMIT');
      console.log(`[ACCESS_TRACE] Committed.`);

      // Fetch Updated List to return to frontend (Must include PM)
      let updatedUsers = [];
      if (level === 'module') {
        const res = await client.query(`
          SELECT u.id, 
                 COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as name,
                 UPPER(LEFT(COALESCE(u.first_name, ''), 1)) || UPPER(LEFT(COALESCE(u.last_name, ''), 1)) as initials,
                 CASE WHEN u.id = p.project_manager_id THEN 0 ELSE 1 END as sort_order
          FROM module_access ma 
          JOIN users u ON ma.user_id = u.id 
          JOIN project_modules m ON ma.module_id = m.id
          JOIN projects p ON m.project_id = p.id
          WHERE ma.module_id = $1
          
          UNION
          
          SELECT u.id, 
                 COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as name,
                 UPPER(LEFT(COALESCE(u.first_name, ''), 1)) || UPPER(LEFT(COALESCE(u.last_name, ''), 1)) as initials,
                 0 as sort_order
          FROM project_modules m
          JOIN projects p ON m.project_id = p.id
          JOIN users u ON p.project_manager_id = u.id
          WHERE m.id = $1
          
          ORDER BY sort_order, name`, [tId]);
        updatedUsers = res.rows;
      } else if (level === 'task') {
        const res = await client.query(`
          SELECT u.id, 
                 COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as name,
                 UPPER(LEFT(COALESCE(u.first_name, ''), 1)) || UPPER(LEFT(COALESCE(u.last_name, ''), 1)) as initials,
                 CASE WHEN u.id = p.project_manager_id THEN 0 ELSE 1 END as sort_order
          FROM task_access ta 
          JOIN users u ON ta.user_id = u.id 
          JOIN project_tasks t ON ta.task_id = t.id
          JOIN project_modules m ON t.module_id = m.id
          JOIN projects p ON m.project_id = p.id
          WHERE ta.task_id = $1
          
          UNION
          
          SELECT u.id, 
                 COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as name,
                 UPPER(LEFT(COALESCE(u.first_name, ''), 1)) || UPPER(LEFT(COALESCE(u.last_name, ''), 1)) as initials,
                 0 as sort_order
          FROM project_tasks t
          JOIN project_modules m ON t.module_id = m.id
          JOIN projects p ON m.project_id = p.id
          JOIN users u ON p.project_manager_id = u.id
          WHERE t.id = $1
          
          ORDER BY sort_order, name`, [tId]);
        updatedUsers = res.rows;
      } else if (level === 'activity') {
        const res = await client.query(`
          SELECT u.id, 
                 COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as name,
                 UPPER(LEFT(COALESCE(u.first_name, ''), 1)) || UPPER(LEFT(COALESCE(u.last_name, ''), 1)) as initials,
                 CASE WHEN u.id = p.project_manager_id THEN 0 ELSE 1 END as sort_order
          FROM activity_access aa 
          JOIN users u ON aa.user_id = u.id 
          JOIN project_activities a ON aa.activity_id = a.id
          JOIN project_tasks t ON a.task_id = t.id
          JOIN project_modules m ON t.module_id = m.id
          JOIN projects p ON m.project_id = p.id
          WHERE aa.activity_id = $1
          
          UNION
          
          SELECT u.id, 
                 COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as name,
                 UPPER(LEFT(COALESCE(u.first_name, ''), 1)) || UPPER(LEFT(COALESCE(u.last_name, ''), 1)) as initials,
                 0 as sort_order
          FROM project_activities a
          JOIN project_tasks t ON a.task_id = t.id
          JOIN project_modules m ON t.module_id = m.id
          JOIN projects p ON m.project_id = p.id
          JOIN users u ON p.project_manager_id = u.id
          WHERE a.id = $1
          
          ORDER BY sort_order, name`, [tId]);
        updatedUsers = res.rows;
      }

      console.log(`[ACCESS_TRACE] Returning ${updatedUsers.length} users:`, updatedUsers.map(u => u.id));
      return { success: true, updatedUsers };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // --- 6. Permission Helpers ---
  static async canUserManageProject(userId: number, role: string, projectId: number): Promise<boolean> {
    if (role === 'super_admin') return true;
    const res = await query(`
      WITH RECURSIVE hierarchy AS (
        SELECT id FROM users WHERE id = $1
        UNION ALL
        SELECT u.id FROM users u JOIN hierarchy h ON u.reporting_manager_id = h.id
      )
      SELECT 1 FROM projects WHERE id = $2 AND project_manager_id IN (SELECT id FROM hierarchy)
    `, [userId, projectId]);
    return res.rows.length > 0;
  }

  static async canUserManageResources(userId: number, role: string, projectId: number): Promise<boolean> {
    // STRICT: Only the Project Manager assigned to THIS project can manage modules/tasks
    // removed super_admin bypass
    const res = await query(`
      SELECT 1 FROM projects 
      WHERE id = $2 AND project_manager_id = $1 
      AND status = 'active'
    `, [userId, projectId]);

    return res.rows.length > 0;
  }

  static async canUserManageModule(userId: number, role: string, moduleId: number): Promise<boolean> {
    // removed super_admin bypass
    const res = await query(`
      WITH RECURSIVE hierarchy AS (
        SELECT id FROM users WHERE id = $1
        UNION ALL
        SELECT u.id FROM users u JOIN hierarchy h ON u.reporting_manager_id = h.id
      )
      SELECT 1 FROM project_modules m JOIN projects p ON m.project_id = p.id
      WHERE m.id = $2 AND p.project_manager_id IN (SELECT id FROM hierarchy) AND p.status = 'active'
    `, [userId, moduleId]);
    return res.rows.length > 0;
  }

  static async canUserManageTask(userId: number, role: string, taskId: number): Promise<boolean> {
    // removed super_admin bypass
    const res = await query(`
      WITH RECURSIVE hierarchy AS (
        SELECT id FROM users WHERE id = $1
        UNION ALL
        SELECT u.id FROM users u JOIN hierarchy h ON u.reporting_manager_id = h.id
      )
      SELECT 1 FROM project_tasks t JOIN project_modules m ON t.module_id = m.id JOIN projects p ON m.project_id = p.id
      WHERE t.id = $2 AND p.project_manager_id IN (SELECT id FROM hierarchy) AND p.status = 'active'
    `, [userId, taskId]);
    return res.rows.length > 0;
  }

  static async canUserManageActivity(userId: number, role: string, activityId: number): Promise<boolean> {
    // removed super_admin bypass
    const res = await query(`
      WITH RECURSIVE hierarchy AS (
        SELECT id FROM users WHERE id = $1
        UNION ALL
        SELECT u.id FROM users u JOIN hierarchy h ON u.reporting_manager_id = h.id
      )
      SELECT 1 FROM project_activities a JOIN project_tasks t ON a.task_id = t.id
      JOIN project_modules m ON t.module_id = m.id JOIN projects p ON m.project_id = p.id
      WHERE a.id = $2 AND p.project_manager_id IN (SELECT id FROM hierarchy) AND p.status = 'active'
    `, [userId, activityId]);
    return res.rows.length > 0;
  }

  static async deleteTask(id: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Delete associated timesheet entries
      await client.query(`
        DELETE FROM project_entries 
        WHERE activity_id IN (SELECT id FROM project_activities WHERE task_id = $1)
      `, [id]);

      // 2. Delete Activity Access for all activities in this task
      await client.query(`
        DELETE FROM activity_access 
        WHERE activity_id IN (SELECT id FROM project_activities WHERE task_id = $1)
      `, [id]);

      // 3. Delete Activities in this task
      await client.query(`DELETE FROM project_activities WHERE task_id = $1`, [id]);

      // 4. Delete associated timesheet entries for the task itself
      await client.query(`DELETE FROM project_entries WHERE task_id = $1`, [id]);

      // 5. Delete Task Access
      await client.query(`DELETE FROM task_access WHERE task_id = $1`, [id]);

      // 6. Delete Task
      const res = await client.query(`DELETE FROM project_tasks WHERE id = $1 RETURNING *`, [id]);

      await client.query('COMMIT');
      return res.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async deleteActivity(id: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Delete associated timesheet entries
      await client.query(`DELETE FROM project_entries WHERE activity_id = $1`, [id]);

      // 2. Delete Activity Access
      await client.query(`DELETE FROM activity_access WHERE activity_id = $1`, [id]);

      // 3. Delete Activity
      const res = await client.query(`DELETE FROM project_activities WHERE id = $1 RETURNING *`, [id]);

      await client.query('COMMIT');
      return res.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // --- 7. Project Deletion (Super Admin Only) ---
  static async deleteProject(projectId: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Delete associated timesheet entries
      await client.query(`DELETE FROM project_entries WHERE project_id = $1`, [projectId]);

      // 2. Delete Activity Access
      await client.query(`
        DELETE FROM activity_access 
        WHERE activity_id IN (
          SELECT a.id FROM project_activities a
          JOIN project_tasks t ON a.task_id = t.id
          JOIN project_modules m ON t.module_id = m.id
          WHERE m.project_id = $1
        )`, [projectId]);

      // 3. Delete Activities
      await client.query(`
        DELETE FROM project_activities 
        WHERE task_id IN (
          SELECT t.id FROM project_tasks t
          JOIN project_modules m ON t.module_id = m.id
          WHERE m.project_id = $1
        )`, [projectId]);

      // 4. Delete Task Access
      await client.query(`
        DELETE FROM task_access 
        WHERE task_id IN (
          SELECT t.id FROM project_tasks t
          JOIN project_modules m ON t.module_id = m.id
          WHERE m.project_id = $1
        )`, [projectId]);

      // 5. Delete Tasks
      await client.query(`
        DELETE FROM project_tasks 
        WHERE module_id IN (
          SELECT id FROM project_modules WHERE project_id = $1
        )`, [projectId]);

      // 6. Delete Module Access
      await client.query(`
        DELETE FROM module_access 
        WHERE module_id IN (
          SELECT id FROM project_modules WHERE project_id = $1
        )`, [projectId]);

      // 7. Delete Modules
      await client.query(`DELETE FROM project_modules WHERE project_id = $1`, [projectId]);

      // 8. Delete Project Members
      await client.query(`DELETE FROM project_members WHERE project_id = $1`, [projectId]);

      // 9. Delete Project
      const deleteRes = await client.query(`DELETE FROM projects WHERE id = $1 RETURNING *`, [projectId]);

      if (deleteRes.rows.length === 0) {
        throw new Error('Project not found');
      }

      await client.query('COMMIT');
      return deleteRes.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}
