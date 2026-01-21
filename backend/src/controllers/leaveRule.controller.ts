import { Request, Response } from 'express';
import * as leaveRuleService from '../services/leaveRule.service';
import { logger } from '../utils/logger';

export const getLeaveTypes = async (req: Request, res: Response) => {
    try {
        const types = await leaveRuleService.getLeaveTypes();
        res.json(types);
    } catch (error: any) {
        logger.error('Error fetching leave types:', error);
        res.status(500).json({ error: error.message });
    }
};

export const createLeaveType = async (req: Request, res: Response) => {
    try {
        const { code, name, description, roles } = req.body;

        // Basic validation
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        // Use name as code if code is missing
        const finalCode = code || name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

        const newType = await leaveRuleService.createLeaveType(finalCode, name, description);

        // Also init default configs
        await leaveRuleService.createDefaultConfigsForNewType(newType.id, roles);

        res.status(201).json(newType);
    } catch (error: any) {
        logger.error('Error creating leave type:', error);
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Leave type code already exists' });
        }
        res.status(500).json({ error: error.message });
    }
};

export const deleteLeaveType = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        await leaveRuleService.deleteLeaveType(id);
        res.json({ success: true, message: 'Leave type permanently deleted' });
    } catch (error: any) {
        logger.error('Error deleting leave type:', error);
        res.status(500).json({ error: error.message });
    }
};

export const updateLeaveType = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const { name, description, is_active, roles } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        const updated = await leaveRuleService.updateLeaveType(id, {
            name,
            description,
            is_active,
            roles
        });

        res.json(updated);
    } catch (error: any) {
        logger.error('Error updating leave type:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getPolicies = async (req: Request, res: Response) => {
    try {
        const policies = await leaveRuleService.getAllPolicies();
        logger.info(`[LEAVE RULE CONTROLLER] [GET POLICIES] Fetched ${policies.length} policies`);

        // Group by Role for easier frontend consumption
        const grouped: any = {};
        policies.forEach(p => {
            if (!grouped[p.role]) grouped[p.role] = [];
            grouped[p.role].push(p);
        });

        logger.info(`[LEAVE RULE CONTROLLER] [GET POLICIES] Grouped roles: ${Object.keys(grouped).join(', ')}`);
        res.json(grouped);
    } catch (error: any) {
        logger.error('Error fetching policies:', error);
        res.status(500).json({ error: error.message });
    }
};

export const updatePolicy = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const updates = req.body;
        logger.info(`[UPDATE POLICY] ID: ${id}, Updates: ${JSON.stringify(updates)}`);

        const updated = await leaveRuleService.updatePolicy(id, updates);
        res.json(updated);
    } catch (error: any) {
        logger.error('[UPDATE POLICY] Error updating policy:', {
            id: req.params.id,
            error: error.message,
            stack: error.stack,
            body: req.body
        });
        res.status(500).json({ error: error.message });
    }
};
