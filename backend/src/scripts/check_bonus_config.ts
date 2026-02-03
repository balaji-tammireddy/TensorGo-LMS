
import { pool } from '../database/db';
import { getAllPolicies, getLeaveTypes } from '../services/leaveRule.service';

async function main() {
    try {
        console.log('--- Checking Leave Types ---');
        const types = await getLeaveTypes();
        console.table(types.map(t => ({ id: t.id, name: t.name, code: t.code, active: t.is_active })));

        const casualParams = types.find(t => t.code === 'casual');
        if (!casualParams) {
            console.error('ERROR: No leave type with code "casual" found!');
            const potential = types.find(t => t.name.toLowerCase().includes('casual'));
            if (potential) console.log(`Did you mean code: "${potential.code}" for name "${potential.name}"?`);
        } else {
            console.log('SUCCESS: "casual" leave type found.');
        }

        console.log('\n--- Checking Policy Configurations (Employee) ---');
        const policies = await getAllPolicies();
        const empPolicies = policies.filter(p => p.role === 'employee');

        // Show raw dump of what service sees
        const policyMap: any = {};
        policies.forEach(p => {
            if (!policyMap[p.role]) policyMap[p.role] = {};
            if (p.leave_type_code) policyMap[p.role][p.leave_type_code] = p;
        });

        console.log('Keys available in employee policy map:', Object.keys(policyMap['employee'] || {}));

        const casualPolicy = policyMap['employee']?.['casual'];
        if (!casualPolicy) {
            console.error('ERROR: No policy found under key "casual" for employee!');
            // Check if it exists under another key
            const existing = empPolicies.find(p => p.leave_type_name && p.leave_type_name.toLowerCase().includes('casual'));
            if (existing) console.log(`Policy exists for code: "${existing.leave_type_code}"`);
        } else {
            console.log('SUCCESS: Casual policy found.');
            console.log('Annual Credit:', casualPolicy.annual_credit);
            console.log('3-Year Bonus:', casualPolicy.anniversary_3_year_bonus);
        }

        // Check date logic
        const now = new Date();
        const month = now.getMonth() + 1;
        const isQuarterEnd = [3, 6, 9, 12].includes(month);
        console.log(`\nToday: ${now.toISOString()}`);
        console.log(`Is Quarter End? ${isQuarterEnd}`);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
main();
