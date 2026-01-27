import { pool } from './src/database/db';

async function checkAndFixLOPBalances() {
    try {
        // Check for LOP balances > 10
        const result = await pool.query(
            'SELECT id, employee_id, lop_balance FROM leave_balances WHERE lop_balance > 10'
        );

        console.log(`Found ${result.rows.length} records with LOP balance > 10:`);
        result.rows.forEach(row => {
            console.log(`  - ID: ${row.id}, Employee ID: ${row.employee_id}, LOP Balance: ${row.lop_balance}`);
        });

        if (result.rows.length > 0) {
            console.log('\nDo you want to cap these values at 10? (This will update the database)');
            console.log('Updating LOP balances to 10...');

            const updateResult = await pool.query(
                'UPDATE leave_balances SET lop_balance = 10 WHERE lop_balance > 10'
            );

            console.log(`Updated ${updateResult.rowCount} records.`);
        } else {
            console.log('No records need updating.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

checkAndFixLOPBalances();
