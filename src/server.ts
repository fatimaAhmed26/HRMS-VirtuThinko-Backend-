import 'dotenv/config';
import app from './app';
import { startScheduler } from './jobs/scheduler';

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log(`HRMS API running on http://localhost:${PORT}`);
  startScheduler();
});