import { pool } from './src/database/db';

async function updateCasualLeaveEffectiveDate() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Get the casual leave type ID
        const casualLeaveResult = await client.query(`
      SELECT id FROM leave_types WHERE code = 'casual'
    `);

        if (casualLeaveResult.rows.length === 0) {
            throw new Error('Casual leave type not found');
        }

        const casualLeaveId = casualLeaveResult.rows[0].id;
        console.log(`Casual Leave type ID: ${casualLeaveId}`);

        // Update effective_from for manager, hr, and intern roles
        const rolesToUpdate = ['manager', 'hr', 'intern'];

        for (const role of rolesToUpdate) {
            console.log(`Updating effective_from for ${role}...`);
            const result = await client.query(`
        UPDATE leave_policy_configurations
        SET effective_from = $1
        WHERE role = $2 AND leave_type_id = $3
        RETURNING role, effective_from
      `, ['2024-08-19', role, casualLeaveId]);

            if (result.rows.length > 0) {
                console.log(`✅ Updated ${role}: effective_from = ${result.rows[0].effective_from}`);
            } else {
                console.log(`⚠️  No configuration found for ${role}`);
            }
        }

        await client.query('COMMIT');
        console.log('\n✅ Successfully updated effective dates!');

        // Verify the results
        const verifyResult = await client.query(`
      SELECT 
        lpc.role,
        lt.name as leave_type,
        lpc.annual_credit,
        lpc.effective_from
      FROM leave_policy_configurations lpc
      JOIN leave_types lt ON lpc.leave_type_id = lt.id
      WHERE lt.code = 'casual'
      ORDER BY lpc.role
    `);

        console.log('\nCasual Leave configurations:');
        console.table(verifyResult.rows);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating effective dates:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

updateCasualLeaveEffectiveDate()
    .then(() => {
        console.log('\nDone!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Failed:', error);
        process.exit(1);
    });
