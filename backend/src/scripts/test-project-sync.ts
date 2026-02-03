import { pool } from '../database/db';
import { ProjectService } from '../services/projectService';
import { createEmployee, updateEmployee, deleteEmployee } from '../services/employee.service';

async function testSync() {
    console.log("--- Starting Project Membership Sync Test ---");

    try {
        // 1. Find a Super Admin to act as requester
        const saRes = await pool.query("SELECT id FROM users WHERE user_role = 'super_admin' LIMIT 1");
        const saId = saRes.rows[0].id;

        // 2. Find a Manager who is a PM on at least one project
        const pmRes = await pool.query(`
            SELECT u.id, u.first_name, p.id as project_id 
            FROM users u 
            JOIN projects p ON u.id = p.project_manager_id 
            WHERE u.user_role IN ('manager', 'hr', 'super_admin') 
            LIMIT 1
        `);

        if (pmRes.rows.length === 0) {
            console.log("No manager with projects found in projects table.");
            return;
        }

        const manager = pmRes.rows[0];
        console.log(`Found Manager: ${manager.first_name} (ID: ${manager.id}) on Project: ${manager.project_id}`);

        // 3. Create a new employee under this manager
        console.log("\n[TEST] Creating new employee under manager...");
        const empData = {
            empId: "TEST-" + Math.floor(Math.random() * 1000000),
            firstName: "Sync",
            lastName: "Tester",
            email: `sync.tester.${Date.now()}@tensorgo.com`,
            contactNumber: "1234567890",
            altContact: "0987654321",
            dateOfBirth: "1995-01-01",
            gender: "Male",
            bloodGroup: "A+",
            maritalStatus: "Single",
            emergencyContactName: "Emergency",
            emergencyContactNo: "1122334455",
            emergencyContactRelation: "Friend",
            designation: "Developer",
            department: "Engineering",
            dateOfJoining: "2026-01-01",
            aadharNumber: "123412341234",
            panNumber: "ABCDE1234F",
            currentAddress: "Test",
            permanentAddress: "Test",
            reportingManagerId: manager.id,
            role: "employee",
            education: [
                { level: "UG", groupStream: "CS", collegeUniversity: "Uni", year: "2018", scorePercentage: "80" },
                { level: "12th", groupStream: "Science", collegeUniversity: "School", year: "2014", scorePercentage: "90" }
            ]
        };

        const createRes = await createEmployee(empData, 'super_admin', saId);
        const newEmpId = createRes.employeeId;
        console.log(`Created Employee ID: ${newEmpId}`);

        // 4. Verify membership
        const memberCheck = await pool.query(
            "SELECT * FROM project_members WHERE user_id = $1 AND project_id = $2",
            [newEmpId, manager.project_id]
        );

        if (memberCheck.rows.length > 0) {
            console.log("✅ SUCCESS: New employee inherited manager's project membership.");
        } else {
            console.log("❌ FAILURE: New employee did NOT inherit manager's project membership.");
        }

        // 6. Test manager update
        console.log("\n[TEST] Change manager for existing employee...");
        // Find another manager on a different project
        const otherPmRes = await pool.query(`
            SELECT u.id, u.first_name, p.id as project_id 
            FROM users u 
            JOIN projects p ON u.id = p.project_manager_id 
            WHERE u.user_role IN ('manager', 'hr', 'super_admin') AND u.id != $1
            LIMIT 1
        `, [manager.id]);

        if (otherPmRes.rows.length > 0) {
            const otherManager = otherPmRes.rows[0];
            console.log(`Found Other Manager: ${otherManager.first_name} (ID: ${otherManager.id}) on Project: ${otherManager.project_id}`);

            await updateEmployee(newEmpId, { reportingManagerId: otherManager.id }, 'super_admin', saId);

            const otherMemberCheck = await pool.query(
                "SELECT * FROM project_members WHERE user_id = $1 AND project_id = $2",
                [newEmpId, otherManager.project_id]
            );

            if (otherMemberCheck.rows.length > 0) {
                console.log("✅ SUCCESS: Employee inherited new manager's project membership.");
            } else {
                console.log("❌ FAILURE: Employee did NOT inherit new manager's project membership.");
            }
        } else {
            console.log("Skipping manager update test (no other manager found).");
        }

        // 7. Clean up
        console.log("\n[CLEANUP] Deleting test employee...");
        await deleteEmployee(newEmpId, saId);
        console.log("Cleanup complete.");

    } catch (err) {
        console.error("Test failed:", err);
    } finally {
        await pool.end();
        console.log("\n--- Test Finished ---");
    }
}

testSync();
