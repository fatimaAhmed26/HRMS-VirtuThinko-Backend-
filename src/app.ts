import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Prisma } from '@prisma/client';
import authRoutes from './modules/auth/auth.routes';
import employeeRoutes from './modules/employees/employee.routes';
import departmentRoutes from './modules/departments/department.routes';
import userRoutes from './modules/users/user.routes';
import roleRoutes from './modules/roles/role.routes';
import leaveRoutes from './modules/leave/leave.routes';
import documentRoutes from './modules/documents/document.routes';
import contractRoutes from './modules/contracts/contract.routes';
import payrollRoutes from './modules/payroll/payroll.routes';
import requestRoutes from './modules/requests/request.routes';
import announcementRoutes from './modules/announcements/announcement.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import reportRoutes from './modules/reports/report.routes';
import auditRoutes from './modules/audit/audit.routes';
import settingsRoutes from './modules/settings/settings.routes';
import { HttpError } from './utils/httpError';
  import clientRoutes from './modules/clients/client.routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/clients', clientRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Route not found' });
});

// error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // malformed JSON body -> 400 instead of 500
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ message: 'Request body is not valid JSON' });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message, details: err.details });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ message: 'A record with this value already exists', fields: err.meta?.target });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ message: 'Record not found' });
      return;
    }
  }
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

export default app;