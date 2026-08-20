import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';
import { prisma } from '../prisma/client';

const authService = new AuthService();

const register = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.register(req.body);
  new ApiResponse(user, 'IUser registered successfully', 201).send(res);
});

const registerAdmin = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.registerAdmin(req.body);
  new ApiResponse(user, 'IUser registered successfully', 201).send(res);
});

const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const userWithToken = await authService.login(email, password);
  new ApiResponse({ ...userWithToken }, 'Login successful').send(res);
});

const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  await authService.logout(req.user?.id!, token);
  new ApiResponse(null, 'Logout successful').send(res);
});

const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user?.id },
    select: {
      id: true,
      email: true,
      role: true,
      branch_id: true,
    },
  });
  new ApiResponse(user, 'Current user fetched').send(res);
});

const changePassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.changePassword(req.user?.id!, req.body);
  new ApiResponse(null, 'Password changed successfully').send(res);
});

export { register, login, logout, registerAdmin, getCurrentUser, changePassword };
