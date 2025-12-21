import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export const validateRequest = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Create a more user-friendly error message
        const errorMessages = error.errors.map(err => {
          const field = err.path.join('.');
          return `${field}: ${err.message}`;
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

