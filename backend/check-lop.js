const { pool } = require('./src/database/db');

async function checkLopPolicies() {
    try {
        const result = await pool.query(`
      SELECT lpc.id, lpc.role, lt.code, lt.name, lpc.annual_credit, lpc.annual_max
      FROM leave_policy_configurations lpc
      JOIN leave_types lt ON lpc.leave_type_id = lt.id
      WHERE lt.code = 'lop'
      ORDER BY lpc.role
    `);

        console.log('LOP Policies in database:');
        console.log(JSON.stringify(result.rows, null, 2));

        const allPolicies = await pool.query(`
      SELECT lpc.role, lt.code, lt.name
      FROM leave_policy_configurations lpc
      JOIN leave_types lt ON lpc.leave_type_id = lt.id
      WHERE lt.is_active = true
      ORDER BY lpc.role, lt.code
    `);

        console.log('\nAll policies grouped by role:');
        const grouped = {};
        allPolicies.rows.forEach(row => {
            if (!grouped[row.role]) grouped[row.role] = [];
            grouped[row.role].push(row.code);
        });
        console.log(JSON.stringify(grouped, null, 2));

        await pool.end();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkLopPolicies();
