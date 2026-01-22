import { pool } from './src/database/db';

async function addSickLeaveToAllRoles() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Create the Sick Leave type
        console.log('Creating Sick Leave type...');
        const leaveTypeResult = await client.query(`
      INSERT INTO leave_types (code, name, description, is_active)
      VALUES ('sick', 'Sick Leave', '', true)
      ON CONFLICT (code) DO UPDATE 
      SET name = EXCLUDED.name, is_active = EXCLUDED.is_active
      RETURNING id
    `);

        const sickLeaveId = leaveTypeResult.rows[0].id;
        console.log(`Sick Leave type created/updated with ID: ${sickLeaveId}`);

        // 2. Get all distinct roles
        const rolesResult = await client.query(`
      SELECT DISTINCT role FROM leave_policy_configurations
      ORDER BY role
    `);

        const roles = rolesResult.rows.map(r => r.role);
        console.log(`Found roles: ${roles.join(', ')}`);

        // 3. Add Sick Leave configuration for each role
        // Based on the image: Annual Credit: 6.00, Monthly: 0.50, all others: 0.00, Effective From: 19/08/2024
        for (const role of roles) {
            console.log(`Adding Sick Leave configuration for role: ${role}`);
            await client.query(`
        INSERT INTO leave_policy_configurations (
          role, 
          leave_type_id, 
          annual_credit, 
          annual_max,
          carry_forward_limit,
          max_leave_per_month,
          anniversary_3_year_bonus,
          anniversary_5_year_bonus,
          effective_from
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (role, leave_type_id) 
        DO UPDATE SET
          annual_credit = EXCLUDED.annual_credit,
          annual_max = EXCLUDED.annual_max,
          carry_forward_limit = EXCLUDED.carry_forward_limit,
          max_leave_per_month = EXCLUDED.max_leave_per_month,
          anniversary_3_year_bonus = EXCLUDED.anniversary_3_year_bonus,
          anniversary_5_year_bonus = EXCLUDED.anniversary_5_year_bonus,
          effective_from = EXCLUDED.effective_from
      `, [
                role,
                sickLeaveId,
                6.00,    // annual_credit
                99.00,   // annual_max (using a high value as max)
                0.00,    // carry_forward_limit
                0.00,    // max_leave_per_month (0 means no monthly limit)
                0.00,    // anniversary_3_year_bonus
                0.00,    // anniversary_5_year_bonus
                '2024-08-19'  // effective_from
            ]);
        }

        await client.query('COMMIT');
        console.log('\n✅ Successfully added Sick Leave to all roles!');

        // 4. Display the results
        const verifyResult = await client.query(`
      SELECT 
        lpc.role,
        lt.name as leave_type,
        lpc.annual_credit,
        lpc.carry_forward_limit,
        lpc.max_leave_per_month,
        lpc.anniversary_3_year_bonus,
        lpc.anniversary_5_year_bonus,
        lpc.effective_from
      FROM leave_policy_configurations lpc
      JOIN leave_types lt ON lpc.leave_type_id = lt.id
      WHERE lt.code = 'sick'
      ORDER BY lpc.role
    `);

        console.log('\nSick Leave configurations:');
        console.table(verifyResult.rows);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error adding Sick Leave:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

addSickLeaveToAllRoles()
    .then(() => {
        console.log('\nDone!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Failed:', error);
        process.exit(1);
    });
