import { connectAdminDB } from './src/lib/mongodb.ts';
import User from './src/models/user.tsx';

async function test() {
  console.log("Connecting...");
  await connectAdminDB();
  console.log("Connected. Finding user...");
  const user = await User.findOne({});
  console.log("User:", user?.email);
  process.exit(0);
}
test().catch(console.error);
