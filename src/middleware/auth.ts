import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

interface AccessPayload extends JwtPayload {
  employeeId: number | null;
  roles: string[];
  permissions: string[];
}

// Verifies "Authorization: Bearer <token>" and puts the user on req.user
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ message: 'Not authenticated' });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as AccessPayload;
    req.user = {
      id: Number(payload.sub),
      employeeId: payload.employeeId,
      roles: payload.roles,
      permissions: payload.permissions,
    };
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// Usage: router.get('/', authenticate, requirePermission('employee:view'), handler)
export function requirePermission(...required: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }
    const allowed = required.some((p) => req.user!.permissions.includes(p));
    if (!allowed) {
      res.status(403).json({ message: 'You do not have permission for this action' });
      return;
    }
    next();
  };
}