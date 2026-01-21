const { pool } = require('./src/database/db');

async function createNoticePeriodPolicies() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get all leave type IDs
        const leaveTypesResult = await client.query(`
      SELECT id, code, name FROM leave_types WHERE is_active = true ORDER BY id
    `);

        console.log('Active leave types:', leaveTypesResult.rows);

        // Create policies for 'on_notice' role
        for (const leaveType of leaveTypesResult.rows) {
            let annualCredit = '0';
            let carryForwardLimit = '0';
            let anniversaryBonus3 = '0';
            let anniversaryBonus5 = '0';

            // Set defaults based on leave type
            if (leaveType.code === 'casual') {
                annualCredit = '12'; // Same as employee by default
                carryForwardLimit = '8';
                anniversaryBonus3 = '3';
                anniversaryBonus5 = '5';
            } else if (leaveType.code === 'sick') {
                annualCredit = '6'; // Same as employee by default
                carryForwardLimit = '0';
            } else if (leaveType.code === 'lop') {
                annualCredit = '10'; // Same as other roles
            }

            const insertResult = await client.query(`
        INSERT INTO leave_policy_configurations 
        (role, leave_type_id, annual_credit, annual_max, carry_forward_limit, anniversary_3_year_bonus, anniversary_5_year_bonus)
        VALUES ('on_notice', $1, $2, '0', $3, $4, $5)
        ON CONFLICT (role, leave_type_id) DO UPDATE
        SET annual_credit = $2, carry_forward_limit = $3, anniversary_3_year_bonus = $4, anniversary_5_year_bonus = $5
        RETURNING id, role
      `, [leaveType.id, annualCredit, carryForwardLimit, anniversaryBonus3, anniversaryBonus5]);

            console.log(`Created/Updated policy for on_notice - ${leaveType.code}:`, insertResult.rows[0]);
        }

        await client.query('COMMIT');
        console.log('\nSuccess! Notice period policies created.');

        // Verify
        const verifyResult = await pool.query(`
      SELECT lpc.role, lt.code, lt.name, lpc.annual_credit, lpc.carry_forward_limit
      FROM leave_policy_configurations lpc
      JOIN leave_types lt ON lpc.leave_type_id = lt.id
      WHERE lpc.role = 'on_notice'
      ORDER BY lt.code
    `);

        console.log('\nVerification - All on_notice policies:');
        console.log(JSON.stringify(verifyResult.rows, null, 2));

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

createNoticePeriodPolicies();
