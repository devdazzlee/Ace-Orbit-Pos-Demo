import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/app';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        branch_id?: string;
      };
    }
  }
}

const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      throw new AppError(401, 'Authentication required');
    }

    // Verify JWT signature (no expiry since we sign without expiresIn)
    const decoded = jwt.verify(token, config.jwtSecret) as {
      id: string;
      role: string;
      branch_id?: string;
    };

    // Confirm an active DB session exists for this token
    const session = await prisma.session.findUnique({ where: { token } });
    if (!session) {
      throw new AppError(401, 'Session not found. Please log in again.');
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return next(new AppError(401, 'Invalid or expired token'));
    }
    next(error);
  }
};

const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError(403, 'Unauthorized access');
    }
    next();
  };
};

export { authenticate, authorize };
