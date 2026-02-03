import { ProjectService } from '../services/projectService';
import { pool } from '../database/db';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from the backend root
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function manualSync() {
    console.log("--- Starting Manual Global Project Sync ---");
    try {
        await ProjectService.syncAllProjectTeams();
        console.log("--- Sync Completed Successfully ---");
    } catch (err) {
        console.error("--- Sync Failed ---");
        console.error(err);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

manualSync();
