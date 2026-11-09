import 'dotenv/config';
import { checkEnv, HOST } from './config/env';

checkEnv(); // stop here with a clear message if a secret in .env is missing or weak

// imported after the check so nothing runs with a bad configuration
import('./app').then(({ default: app }) => {
  const PORT = Number(process.env.PORT) || 5000;
  app.listen(PORT, HOST, () => {
    console.log(`HRMS API running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    import('./jobs/scheduler').then(({ startScheduler }) => startScheduler());
  });
});
