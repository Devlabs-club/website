import "dotenv/config";
import { connectMomentumDB } from "../src/lib/mongodb";
import { getMomentumApplicationModel } from "../src/models/momentumApplication";

const GROUPS = ["Velocity", "Inertia", "Flux", "Gravity"] as const;

function getArgFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

async function getApprovedGroupCounts(
  MomentumApplication: ReturnType<typeof getMomentumApplicationModel>
) {
  const counts = await MomentumApplication.aggregate([
    { $match: { status: "approved", group: { $in: GROUPS } } },
    { $group: { _id: "$group", count: { $sum: 1 } } },
  ]);

  const groupCounts: Record<string, number> = Object.fromEntries(
    GROUPS.map((group) => [group, 0])
  );
  counts.forEach((countRow) => {
    groupCounts[countRow._id] = countRow.count;
  });

  return groupCounts;
}

function pickLeastFilledGroup(groupCounts: Record<string, number>): string {
  const minCount = Math.min(...Object.values(groupCounts));
  const candidateGroups = GROUPS.filter((group) => groupCounts[group] === minCount);
  return candidateGroups[Math.floor(Math.random() * candidateGroups.length)];
}

async function main() {
  const isDryRun = getArgFlag("--dry-run");

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

    let groupCounts = await getApprovedGroupCounts(MomentumApplication);
    console.log("Current approved counts by group:", groupCounts);
    if (isDryRun) {
      console.log("Dry run mode enabled. No database writes will be made.");
    }

    // Assign a group to each application
    for (const app of missingGroupApps) {
      const assignedGroup = pickLeastFilledGroup(groupCounts);
      if (!isDryRun) {
        app.group = assignedGroup;
        await app.save();
      }
      groupCounts[assignedGroup] += 1;

      console.log(`Assigned ${app.firstName} ${app.lastName} (${app.email}) to group: ${assignedGroup}`);
    }

    console.log("Final approved counts by group:", groupCounts);
    console.log(
      isDryRun
        ? "Dry run complete. Re-run without --dry-run to persist updates."
        : "Successfully assigned all missing groups."
    );
    process.exit(0);
  } catch (error) {
    console.error("Error assigning groups:", error);
    process.exit(1);
  }
}

main();
