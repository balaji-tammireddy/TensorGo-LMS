import { z } from 'zod';

export const applyLeaveSchema = z.object({
  body: z.object({
    leaveType: z.enum(['casual', 'sick', 'lop']),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    startType: z.enum(['full', 'half']),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    endType: z.enum(['full', 'half']),
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
    timeForPermission: z.object({
      start: z.string().optional(),
      end: z.string().optional()
    }).optional()
  })
});

export const approveLeaveSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid leave request ID')
  }),
  body: z.object({
    comment: z.string().optional()
  })
});

export const rejectLeaveSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid leave request ID')
  }),
  body: z.object({
    comment: z.string().min(1, 'Comment is required for rejection')
  })
});

export const updateLeaveSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid leave request ID')
  }),
  body: z.object({
    leaveType: z.enum(['casual', 'sick', 'lop']),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    startType: z.enum(['full', 'half']),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    endType: z.enum(['full', 'half']),
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
    timeForPermission: z.object({
      start: z.string().optional(),
      end: z.string().optional()
    }).optional()
  })
});

export const deleteLeaveSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid leave request ID')
  })
});

