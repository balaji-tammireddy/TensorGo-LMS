import { pool } from '../database/db';
import { logger } from '../utils/logger';

export interface LeaveType {
    id: number;
    code: string;
    name: string;
    description: string;
    is_active: boolean;
}

export interface LeavePolicyConfig {
    id: number;
    role: string;
    leave_type_id: number;
    annual_credit: string;
    annual_max: string;
    carry_forward_limit: string;
    max_leave_per_month: string;
    anniversary_3_year_bonus: string;
    anniversary_5_year_bonus: string;
    leave_type_name?: string;
    leave_type_code?: string;
    effective_from?: string;
}

/**
 * Get all leave types
 */
export const getLeaveTypes = async (): Promise<(LeaveType & { roles: string[] })[]> => {
    logger.info(`[LEAVE RULE SERVICE] [GET TYPES] Fetching leave types with roles`);
    const result = await pool.query(`
        SELECT lt.*, 
        ARRAY(SELECT role FROM leave_policy_configurations WHERE leave_type_id = lt.id) as roles
        FROM leave_types lt 
        ORDER BY lt.id ASC
    `);
    return result.rows;
};

/**
 * Create a new leave type
 */
export const createLeaveType = async (code: string, name: string, description: string): Promise<LeaveType> => {
    logger.info(`[LEAVE RULE SERVICE] [CREATE TYPE] creating ${name} (${code})`);

    const safeCode = code.toLowerCase().replace(/[^a-z0-9_]/g, '');

    const result = await pool.query(
        `INSERT INTO leave_types (code, name, description, is_active)
     VALUES ($1, $2, $3, true)
     RETURNING *`,
        [safeCode, name, description]
    );

    return result.rows[0];
};

/**
 * Delete a leave type and its associated policies (Hard Delete)
 */
export const deleteLeaveType = async (id: number): Promise<void> => {
    logger.info(`[LEAVE RULE SERVICE] [DELETE TYPE] Permanently deleting leave type ${id}`);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM leave_policy_configurations WHERE leave_type_id = $1', [id]);
        await client.query('DELETE FROM leave_types WHERE id = $1', [id]);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Update a leave type and its role associations
 */
export const updateLeaveType = async (
    id: number,
    data: { name: string; description: string; is_active: boolean; roles: string[] }
): Promise<LeaveType> => {
    logger.info(`[LEAVE RULE SERVICE] [UPDATE TYPE] Updating leave type ${id}`);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `UPDATE leave_types 
             SET name = $1, description = $2, is_active = $3
             WHERE id = $4
             RETURNING *`,
            [data.name, data.description, data.is_active, id]
        );

        if (result.rows.length === 0) {
            throw new Error('Leave type not found');
        }

        const leaveType = result.rows[0];

        await client.query(
            `DELETE FROM leave_policy_configurations 
             WHERE leave_type_id = $1 AND role != ALL($2)`,
            [id, data.roles]
        );

        for (const role of data.roles) {
            await client.query(
                `INSERT INTO leave_policy_configurations (role, leave_type_id)
                 VALUES ($1, $2)
                 ON CONFLICT (role, leave_type_id) DO NOTHING`,
                [role, id]
            );
        }

        await client.query('COMMIT');
        return leaveType;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Get all policy configurations, joined with leave types
 */
export const getAllPolicies = async (): Promise<LeavePolicyConfig[]> => {
    logger.info(`[LEAVE RULE SERVICE] [GET POLICIES] Fetching all policies`);
    const result = await pool.query(`
    SELECT 
      lpc.*,
      lt.name as leave_type_name,
      lt.code as leave_type_code
    FROM leave_policy_configurations lpc
    JOIN leave_types lt ON lpc.leave_type_id = lt.id
    WHERE lt.is_active = true
    ORDER BY lpc.role, lt.id
  `);
    return result.rows;
};

/**
 * Update a specific policy configuration
 */
export const updatePolicy = async (
    id: number,
    updates: Partial<LeavePolicyConfig>
): Promise<LeavePolicyConfig> => {
    logger.info(`[LEAVE RULE SERVICE] [UPDATE POLICY] Updating policy ${id}`);

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.annual_credit !== undefined) {
        fields.push(`annual_credit = $${idx++}`);
        values.push(updates.annual_credit);
    }
    if (updates.annual_max !== undefined) {
        fields.push(`annual_max = $${idx++}`);
        values.push(updates.annual_max);
    }
    if (updates.carry_forward_limit !== undefined) {
        fields.push(`carry_forward_limit = $${idx++}`);
        values.push(updates.carry_forward_limit);
    }
    if (updates.max_leave_per_month !== undefined) {
        fields.push(`max_leave_per_month = $${idx++}`);
        values.push(updates.max_leave_per_month);
    }
    if (updates.anniversary_3_year_bonus !== undefined) {
        fields.push(`anniversary_3_year_bonus = $${idx++}`);
        values.push(updates.anniversary_3_year_bonus);
    }
    if (updates.anniversary_5_year_bonus !== undefined) {
        fields.push(`anniversary_5_year_bonus = $${idx++}`);
        values.push(updates.anniversary_5_year_bonus);
    }
    if (updates.effective_from !== undefined) {
        fields.push(`effective_from = $${idx++}`);
        // Convert empty string to null for DATE column
        values.push(updates.effective_from === '' ? null : updates.effective_from);
    }

    values.push(id);

    const query = `
    UPDATE leave_policy_configurations
    SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $${idx}
    RETURNING *
  `;

    logger.info(`[UPDATE POLICY] Query: ${query}`);
    logger.info(`[UPDATE POLICY] Values: ${JSON.stringify(values)}`);

    const result = await pool.query(query, values);
    return result.rows[0];
};

/**
 * Helper to get all configs for a role keyed by leave type code
 */
export const getConfigsForRole = async (role: string) => {
    const result = await pool.query(`
    SELECT lpc.*, lt.code as leave_type_code
    FROM leave_policy_configurations lpc
    JOIN leave_types lt ON lpc.leave_type_id = lt.id
    WHERE lpc.role = $1 AND lt.is_active = true
  `, [role]);

    const configMap: Record<string, LeavePolicyConfig> = {};
    result.rows.forEach((row: any) => {
        configMap[row.leave_type_code] = row;
    });

    return configMap;
};

/**
 * Helper to get specific config for a role and leave type code
 */
export const getConfigForRoleAndType = async (role: string, typeCode: string) => {
    const result = await pool.query(`
    SELECT lpc.* 
    FROM leave_policy_configurations lpc
    JOIN leave_types lt ON lpc.leave_type_id = lt.id
    WHERE lpc.role = $1 AND lt.code = $2
  `, [role, typeCode]);

    return result.rows[0];
};

/**
 * Create default configs for a new Leave Type
 */
export const createDefaultConfigsForNewType = async (leaveTypeId: number, roles?: string[]) => {
    const targetRoles = roles && roles.length > 0 ? roles : ['employee', 'manager', 'hr', 'intern'];
    for (const role of targetRoles) {
        await pool.query(
            `INSERT INTO leave_policy_configurations (role, leave_type_id)
       VALUES ($1, $2)
       ON CONFLICT (role, leave_type_id) DO NOTHING`,
            [role, leaveTypeId]
        );
    }
};
