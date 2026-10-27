import 'dotenv/config';
import { seedDemoUsers,closeDatabase } from '../../src/lib/database/db';
async function main(){await seedDemoUsers();await closeDatabase();console.log('Six isolated demonstration accounts are ready. Credentials are stored in .data/demo-credentials.json (gitignored).');}
main().catch(error=>{console.error(error instanceof Error?error.message:'Seed failed');process.exitCode=1;});
