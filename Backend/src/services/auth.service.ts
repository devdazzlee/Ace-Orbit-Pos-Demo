import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma/client';
import { config } from '../config/app';
import { AppError } from '../utils/apiError';
import { Role, Branch } from '@prisma/client';

class AuthService {
  async register(data: { email: string; password: string; role?: Role }) {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new AppError(400, 'Email already in use');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        role: data.role || Role.ADMIN,
      },
      select: {
        id: true,
        email: true,
        role: true,
        created_at: true,
      },
    });

    return user;
  }

  async registerAdmin(data: { email: string; password: string; branch_id: Branch['id']; role: Role }) {
    if (data.role === Role.SUPER_ADMIN) {
      throw new AppError(400, 'Cannot assign SUPER_ADMIN role');
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new AppError(400, 'Email already in use');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        branch_id: data.branch_id,
        role: data.role || Role.ADMIN,
      },
      select: {
        id: true,
        email: true,
        role: true,
        branch_id: true,
        created_at: true,
      },
    });

    return user;
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        branch_id: true,
        password: true,
        role: true,
      },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new AppError(400, 'Invalid username or password');
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, branch_id: user.branch_id },
      config.jwtSecret,
      // No expiresIn — token is valid until the user explicitly logs out
    );

    // Allow multiple concurrent sessions (different devices/tabs).
    // Each login creates its own session row; other devices stay logged in.
    await prisma.session.create({
      data: { user_id: user.id, token },
      // expires_at omitted → null → persistent session
    });

    const { password: _, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, token };
  }

  async logout(userId: string, token?: string) {
    // Only revoke the current device's session, not every device this user owns.
    if (token) {
      await prisma.session.deleteMany({ where: { user_id: userId, token } });
    } else {
      await prisma.session.deleteMany({ where: { user_id: userId } });
    }
  }

  async changePassword(userId: string, data: { currentPassword: string; newPassword: string }) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError(404, 'User not found');
    }

    const isPasswordValid = await bcrypt.compare(data.currentPassword, user.password);
    if (!isPasswordValid) {
      throw new AppError(400, 'Invalid current password');
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // Optionally logout from other sessions or the current session
    // For now, we just update the password
  }
}

export { AuthService };
