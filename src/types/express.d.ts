export interface AuthUser {
  id: number;
  employeeId: number | null;
  roles: string[];
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}