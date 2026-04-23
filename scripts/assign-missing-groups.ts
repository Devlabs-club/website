import "dotenv/config";
import { connectMomentumDB } from "../src/lib/mongodb";
import { getMomentumApplicationModel } from "../src/models/momentumApplication";

async function main() {
  try {
    console.log("Connecting to database...");
    const conn = await connectMomentumDB();
    const MomentumApplication = getMomentumApplicationModel(conn);

    // Find all approved applications without a group
    const missingGroupApps = await MomentumApplication.find({
      status: "approved",
      $or: [{ group: null }, { group: { $exists: false } }],
    });

    console.log(`Found ${missingGroupApps.length} approved applications without a group.`);

    if (missingGroupApps.length === 0) {
      console.log("Nothing to do. Exiting.");
      process.exit(0);
    }

    const groups = ["Velocity", "Inertia", "Flux", "Gravity"];

    // Assign a group to each application
    for (const app of missingGroupApps) {
      // Re-calculate counts for each assignment to ensure perfect balance
      const counts = await MomentumApplication.aggregate([
        { $match: { status: "approved", group: { $in: groups } } },
        { $group: { _id: "$group", count: { $sum: 1 } } },
      ]);

      const groupCounts: Record<string, number> = Object.fromEntries(
        groups.map((g) => [g, 0])
      );
      counts.forEach((c) => {
        groupCounts[c._id] = c.count;
      });

      const minCount = Math.min(...Object.values(groupCounts));
      const candidateGroups = groups.filter((g) => groupCounts[g] === minCount);

      const assignedGroup =
        candidateGroups[Math.floor(Math.random() * candidateGroups.length)];

      app.group = assignedGroup;
      await app.save();

      console.log(`Assigned ${app.firstName} ${app.lastName} (${app.email}) to group: ${assignedGroup}`);
    }

    console.log("Successfully assigned all missing groups.");
    process.exit(0);
  } catch (error) {
    console.error("Error assigning groups:", error);
    process.exit(1);
  }
}

main();
