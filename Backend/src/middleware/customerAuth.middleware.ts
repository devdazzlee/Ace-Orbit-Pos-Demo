import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/app';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { Customer } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      customer: {
        id: string;
        email: string;
      };
    }
  }
}

const authenticateCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('[authenticateCustomer] Middleware called for path:', req.path);
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[authenticateCustomer] No valid auth header');
      throw new AppError(401, 'Authentication required. Please provide a valid token.');
    }

    const token = authHeader.split(' ')[1];
    if (!token) throw new AppError(401, 'Authentication required');

    const decoded = jwt.verify(token, config.jwtSecret) as {
      id: Customer['id'];
      email: Customer['email'];
    };

    if (!decoded.id || !decoded.email) {
      throw new AppError(401, 'Invalid token structure');
    }

    // Confirm an active DB session exists for this token
    const session = await prisma.customerSession.findUnique({ where: { token } });
    if (!session) {
      throw new AppError(401, 'Session not found. Please log in again.');
    }

    req.customer = { id: decoded.id, email: decoded.email };
    console.log('[authenticateCustomer] Authentication successful for customer:', decoded.id);
    next();
  } catch (error) {
    console.log('[authenticateCustomer] Error:', error);
    if (error instanceof AppError) return next(error);
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return next(new AppError(401, 'Invalid or expired token'));
    }
    next(error);
  }
};

export { authenticateCustomer };
