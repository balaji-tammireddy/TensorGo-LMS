import { pool } from './src/database/db';

async function checkNullAuditInTimesheets() {
    try {
        console.log('=== Checking for NULL audit columns in project-related tables ===\n');

        // Check project_entries
        const entriesResult = await pool.query(`
      SELECT COUNT(*) as count, 
             COUNT(CASE WHEN created_by IS NULL THEN 1 END) as null_created_by,
             COUNT(CASE WHEN updated_by IS NULL THEN 1 END) as null_updated_by
      FROM project_entries
    `);

        console.log('📊 project_entries:');
        console.log(`  Total records: ${entriesResult.rows[0].count}`);
        console.log(`  NULL created_by: ${entriesResult.rows[0].null_created_by}`);
        console.log(`  NULL updated_by: ${entriesResult.rows[0].null_updated_by}`);

        if (entriesResult.rows[0].null_created_by > 0 || entriesResult.rows[0].null_updated_by > 0) {
            console.log('\n⚠️  Found NULL values! Fetching sample records...\n');
            const sampleResult = await pool.query(`
        SELECT id, user_id, log_date, created_by, updated_by
        FROM project_entries
        WHERE created_by IS NULL OR updated_by IS NULL
        LIMIT 10
      `);

            console.log('Sample records with NULL audit columns:');
            sampleResult.rows.forEach(row => {
                console.log(`  ID: ${row.id}, User: ${row.user_id}, Date: ${row.log_date}, created_by: ${row.created_by}, updated_by: ${row.updated_by}`);
            });
        }

        // Check other project tables
        const tables = ['projects', 'project_modules', 'project_tasks', 'project_activities'];

        for (const table of tables) {
            const result = await pool.query(`
        SELECT COUNT(*) as count,
               COUNT(CASE WHEN created_by IS NULL THEN 1 END) as null_created_by,
               COUNT(CASE WHEN updated_by IS NULL THEN 1 END) as null_updated_by
        FROM ${table}
      `);

            console.log(`\n📊 ${table}:`);
            console.log(`  Total records: ${result.rows[0].count}`);
            console.log(`  NULL created_by: ${result.rows[0].null_created_by}`);
            console.log(`  NULL updated_by: ${result.rows[0].null_updated_by}`);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

checkNullAuditInTimesheets();
