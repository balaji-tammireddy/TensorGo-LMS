import { pool } from './src/database/db';

async function updateCasualLeaveForHRAndManager() {
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

        // Configuration from the image:
        // Annual Credit: 12.00
        // Carry Forward Limit: 8.00
        // Max Monthly Limit: 10.00
        // 3-Year Anniversary Bonus: 3.00
        // 5-Year Anniversary Bonus: 5.00
        // Effective From: 19/08/2024

        const config = {
            annual_credit: 12.00,
            annual_max: 99.00,  // Using high value as max
            carry_forward_limit: 8.00,
            max_leave_per_month: 10.00,
            anniversary_3_year_bonus: 3.00,
            anniversary_5_year_bonus: 5.00,
            effective_from: '2024-08-19'
        };

        const rolesToUpdate = ['hr', 'manager'];

        for (const role of rolesToUpdate) {
            console.log(`\nUpdating Casual Leave configuration for ${role}...`);
            const result = await client.query(`
        UPDATE leave_policy_configurations
        SET 
          annual_credit = $1,
          annual_max = $2,
          carry_forward_limit = $3,
          max_leave_per_month = $4,
          anniversary_3_year_bonus = $5,
          anniversary_5_year_bonus = $6,
          effective_from = $7,
          updated_at = CURRENT_TIMESTAMP
        WHERE role = $8 AND leave_type_id = $9
        RETURNING *
      `, [
                config.annual_credit,
                config.annual_max,
                config.carry_forward_limit,
                config.max_leave_per_month,
                config.anniversary_3_year_bonus,
                config.anniversary_5_year_bonus,
                config.effective_from,
                role,
                casualLeaveId
            ]);

            if (result.rows.length > 0) {
                console.log(`✅ Updated ${role}:`);
                console.log(`   - Annual Credit: ${result.rows[0].annual_credit}`);
                console.log(`   - Carry Forward Limit: ${result.rows[0].carry_forward_limit}`);
                console.log(`   - Max Monthly Limit: ${result.rows[0].max_leave_per_month}`);
                console.log(`   - 3-Year Bonus: ${result.rows[0].anniversary_3_year_bonus}`);
                console.log(`   - 5-Year Bonus: ${result.rows[0].anniversary_5_year_bonus}`);
                console.log(`   - Effective From: ${result.rows[0].effective_from}`);
            } else {
                console.log(`⚠️  No configuration found for ${role}`);
            }
        }

        await client.query('COMMIT');
        console.log('\n✅ Successfully updated Casual Leave for HR and Manager!');

        // Verify the results
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
      WHERE lt.code = 'casual' AND lpc.role IN ('hr', 'manager')
      ORDER BY lpc.role
    `);

        console.log('\nUpdated Casual Leave configurations:');
        console.table(verifyResult.rows);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating configurations:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

updateCasualLeaveForHRAndManager()
    .then(() => {
        console.log('\nDone!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Failed:', error);
        process.exit(1);
    });
