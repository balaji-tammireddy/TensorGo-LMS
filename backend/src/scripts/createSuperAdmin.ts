import { pool } from '../database/db';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const createAdmin = async () => {
    try {
        const email = 'HRMS@tensorgo.com';
        const password = 'tensorgo@2023';
        const hashedPassword = await bcrypt.hash(password, 10);

        console.log(`Checking if user ${email} exists...`);
        const check = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (check.rows.length > 0) {
            console.log('User already exists. Updating password and role...');
            await pool.query(
                'UPDATE users SET password_hash = $1, user_role = $2, must_change_password = $3 WHERE email = $4',
                [hashedPassword, 'super_admin', false, email]
            );
            console.log('User updated successfully.');
        } else {
            console.log('Creating new super admin user...');
            // Generate a random emp_id suffix to avoid collisions if re-running with different email logic
            const empId = 'TG-ADMIN';

            await pool.query(
                `INSERT INTO users (
                    emp_id, email, password_hash, role, first_name, last_name, 
                    date_of_joining, status, must_change_password, designation, department
                ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10)`,
                [empId, email, hashedPassword, 'super_admin', 'System', 'Admin', 'active', false, 'System Administrator', 'IT']
            );
            console.log('User created successfully.');
        }
        process.exit(0);
    } catch (err: any) {
        console.error('Error creating super admin:', err.message);
        if (err.code === '23505') { // Unique violation
            if (err.detail && err.detail.includes('emp_id')) {
                console.error('Emp ID conflict. Please try deleting the existing user or using a different Emp ID.');
            }
        }
        process.exit(1);
    }
};

createAdmin();
