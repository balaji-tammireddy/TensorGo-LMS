
import { pool } from '../database/db';

async function listTablesAndColumns() {
    try {
        const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);

        for (const table of tablesRes.rows) {
            console.log(`\nTable: ${table.table_name}`);
            const colsRes = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [table.table_name]);
            console.table(colsRes.rows);
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
listTablesAndColumns();
