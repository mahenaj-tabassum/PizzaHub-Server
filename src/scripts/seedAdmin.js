import "dotenv/config";

import { getCollection, closeDB } from "../config/db.js";

const seedAdmin = async () => {
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();

  if (!adminEmail) {
    throw new Error("SEED_ADMIN_EMAIL is missing from .env");
  }

  const usersCollection = await getCollection("users");

  const adminUser = await usersCollection.findOne({
    email: adminEmail,
  });

  if (!adminUser) {
    throw new Error(
      `No registered user found with email: ${adminEmail}. ` +
        "Register this account through Better Auth first.",
    );
  }

  const result = await usersCollection.updateOne(
    { _id: adminUser._id },
    {
      $set: {
        role: "admin",
        isBlocked: false,
        subscriptionPlan: "free",
        subscriptionExpiresAt: null,
        updatedAt: new Date(),
      },
    },
  );

  if (result.matchedCount === 0) {
    throw new Error("Admin account could not be updated");
  }

  console.log(`Admin role assigned to: ${adminEmail}`);
};

try {
  await seedAdmin();
} catch (error) {
  console.error("Admin seeding failed:", error.message);
  process.exitCode = 1;
} finally {
  await closeDB();
}
