export interface AuthUser {
  id: number;
  employeeId: number | null;
  roles: string[];
  permissions: string[];
  entities?: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}