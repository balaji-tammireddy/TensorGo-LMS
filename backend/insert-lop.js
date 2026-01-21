const { pool } = require('./src/database/db');

async function insertLopPolicies() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get LOP leave type ID
        const lopResult = await client.query(`SELECT id FROM leave_types WHERE code = 'lop'`);
        if (lopResult.rows.length === 0) {
            console.log('LOP leave type not found!');
            return;
        }

        const lopId = lopResult.rows[0].id;
        console.log(`LOP leave type ID: ${lopId}`);

        // Insert policies for manager, hr, and intern
        const roles = ['manager', 'hr', 'intern'];

        for (const role of roles) {
            const insertResult = await client.query(`
        INSERT INTO leave_policy_configurations 
        (role, leave_type_id, annual_credit, annual_max, carry_forward_limit, anniversary_3_year_bonus, anniversary_5_year_bonus)
        VALUES ($1, $2, '10', '0', '0', '0', '0')
        ON CONFLICT (role, leave_type_id) DO UPDATE
        SET annual_credit = '10'
        RETURNING id, role
      `, [role, lopId]);

            console.log(`Inserted/Updated LOP policy for ${role}:`, insertResult.rows[0]);
        }

        await client.query('COMMIT');
        console.log('\nSuccess! LOP policies created for all roles.');

        // Verify
        const verifyResult = await pool.query(`
      SELECT lpc.role, lt.code, lpc.annual_credit
      FROM leave_policy_configurations lpc
      JOIN leave_types lt ON lpc.leave_type_id = lt.id
      WHERE lt.code = 'lop'
      ORDER BY lpc.role
    `);

        console.log('\nVerification - All LOP policies:');
        console.log(JSON.stringify(verifyResult.rows, null, 2));

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

insertLopPolicies();
