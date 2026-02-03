import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export const validateRequest = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    console.log(`[VALIDATE] Validating request - Path: ${req.path}, Method: ${req.method}`);
    console.log(`[VALIDATE] Body:`, req.body);
    console.log(`[VALIDATE] Params:`, req.params);
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params
      });

      // Update request with parsed/sanitized data (strips extra fields)
      req.body = parsed.body;
      req.query = parsed.query;
      req.params = parsed.params;

      console.log(`[VALIDATE] ✅ Validation passed`);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        console.log(`[VALIDATE] ❌ Validation failed:`, error.errors);
        // Create a more user-friendly error message
        const errorMessages = error.errors.map(err => {
          // Filter out internal wrapper objects
          const fieldPath = err.path
            .filter(p => !['body', 'params', 'query', 'personalInfo', 'employmentInfo', 'documents', 'address', 'education'].includes(String(p)));

          const field = fieldPath.join('.');

          // If the message is a full sentence or known custom message, return it directly
          if (['Invalid email address', 'Name is required', 'Phone number must be at most 10 digits', 'Only organization mail should be used'].includes(err.message)) {
            return err.message;
          }

          // Humanize field name (camelCase to Title Case)
          const humanField = field ? field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()) : '';

          return humanField ? `${humanField}: ${err.message}` : err.message;
        });

        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: errorMessages.length === 1
              ? errorMessages[0]
              : `Validation failed: ${errorMessages.join(', ')}`,
            details: error.errors
          }
        });
      }
      next(error);
    }
  };
};

