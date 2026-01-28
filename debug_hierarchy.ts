
import { pool } from './backend/src/database/db';

async function debugHierarchy() {
    const client = await pool.connect();
    try {
        console.log('--- Projects ---');
        const projects = await client.query('SELECT id, name, project_manager_id FROM projects LIMIT 5');
        console.table(projects.rows);

        if (projects.rows.length > 0) {
            const pmId = projects.rows[0].project_manager_id;
            const projectId = projects.rows[0].id;

            console.log(`\n--- Checking PM ID: ${pmId} for Project ID: ${projectId} ---`);

            // 1. Check Subordinates in Users table
            console.log('\n--- Direct Subordinates (users table) ---');
            const directSubs = await client.query('SELECT id, first_name, last_name, reporting_manager_id, email FROM users WHERE reporting_manager_id = $1', [pmId]);
            console.table(directSubs.rows);

            // 2. Check Recursive Query
            console.log('\n--- Recursive Subordinates (getReportingSubtree) ---');
            const recursiveRes = await client.query(`
        WITH RECURSIVE subordinates AS (
          SELECT id, first_name, last_name, reporting_manager_id FROM users WHERE reporting_manager_id = $1
          UNION ALL
          SELECT u.id, u.first_name, u.last_name, u.reporting_manager_id FROM users u
          INNER JOIN subordinates s ON s.id = u.reporting_manager_id
        )
        SELECT * FROM subordinates
      `, [pmId]);
            console.table(recursiveRes.rows);

            // 3. Check Project Members table
            console.log('\n--- Project Members Table ---');
            const members = await client.query('SELECT pm.user_id, u.first_name, u.last_name FROM project_members pm JOIN users u ON pm.user_id = u.id WHERE pm.project_id = $1', [projectId]);
            console.table(members.rows);
        } else {
            console.log("No projects found.");
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        pool.end();
    }
}

debugHierarchy();
