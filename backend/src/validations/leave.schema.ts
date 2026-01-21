import { z } from 'zod';

const safeTextSchema = z.string()
  .max(255, 'Text cannot exceed 255 characters')
  .regex(/^[a-zA-Z0-9\s\.,\-'()&/]+$/, 'Special characters and emojis are not allowed');

export const applyLeaveSchema = z.object({
  body: z.object({
    leaveType: z.enum(['casual', 'sick', 'lop', 'permission']),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    startType: z.enum(['full', 'half', 'first_half', 'second_half']),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    endType: z.enum(['full', 'half', 'first_half', 'second_half']),
    reason: safeTextSchema.min(5, 'Reason must be at least 5 characters'),
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
    comment: safeTextSchema.optional()
  })
});

export const rejectLeaveSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid leave request ID')
  }),
  body: z.object({
    comment: safeTextSchema.min(1, 'Comment is required for rejection')
  })
});

export const approveLeaveDaySchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid leave request ID'),
    dayId: z.string().regex(/^\d+$/, 'Invalid leave day ID')
  }),
  body: z.object({
    comment: safeTextSchema.optional()
  })
});

export const rejectLeaveDaySchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid leave request ID'),
    dayId: z.string().regex(/^\d+$/, 'Invalid leave day ID')
  }),
  body: z.object({
    comment: safeTextSchema.min(1, 'Comment is required for rejection')
  })
});

export const updateLeaveSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid leave request ID')
  }),
  body: z.object({
    leaveType: z.enum(['casual', 'sick', 'lop', 'permission']),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    startType: z.enum(['full', 'half', 'first_half', 'second_half']),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    endType: z.enum(['full', 'half', 'first_half', 'second_half']),
    reason: safeTextSchema.min(5, 'Reason must be at least 5 characters'),
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


export const rejectLeaveDaysSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid leave request ID')
  }),
  body: z.object({
    dayIds: z.array(z.number()).min(1, 'At least one day must be selected'),
    comment: safeTextSchema.min(1, 'Comment is required for rejection')
  })
});

export const holidaySchema = z.object({
  body: z.object({
    holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    holidayName: safeTextSchema.min(1, 'Holiday name is required').max(100, 'Holiday name cannot exceed 100 characters')
  })
});

export const updateHolidaySchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid holiday ID')
  }),
  body: z.object({
    holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    holidayName: safeTextSchema.min(1, 'Holiday name is required').max(100, 'Holiday name cannot exceed 100 characters')
  })
});

