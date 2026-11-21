// Runs once before the whole suite: bring the test database schema up to date
// with the real migrations (the same ones production uses).
import { execSync } from 'node:child_process';
import './env';

export default function setup() {
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
}
