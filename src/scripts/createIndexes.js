import "dotenv/config";

import { connectToMongoDB, getMongoClient } from "../config/db.js";

const ensureUniqueEmailIndex = async (database) => {
  const collection = database.collection("users");

  let indexes = [];

  try {
    indexes = await collection.listIndexes().toArray();
  } catch (error) {
    // NamespaceNotFound: collection does not exist yet.
    if (error.code !== 26) {
      throw error;
    }
  }

  const emailIndex = indexes.find(
    (index) => index.key?.email === 1 && Object.keys(index.key).length === 1,
  );

  if (emailIndex) {
    if (!emailIndex.unique) {
      throw new Error(
        "Existing users.email index is not unique. " +
          "Review the existing index before proceeding.",
      );
    }

    console.log("users.email unique index already exists");
    return;
  }

  await collection.createIndex(
    { email: 1 },
    {
      unique: true,
      name: "users_email_unique",
    },
  );

  console.log("Created users.email unique index");
};

const createIndexes = async () => {
  const database = await connectToMongoDB();

  // 1. Users
  // Better Auth may already manage this unique index.
  await ensureUniqueEmailIndex(database);

  await database
    .collection("users")
    .createIndex({ role: 1 }, { name: "users_role" });

  // 2. Menu Items
  const menuItems = database.collection("menuItems");

  await menuItems.createIndex(
    { vendorId: 1, createdAt: -1 },
    { name: "menu_vendor_createdAt" },
  );
  await menuItems.createIndex(
    {
      status: 1,
      isAvailable: 1,
      createdAt: -1,
    },
    { name: "menu_public_listing" },
  );
  await menuItems.createIndex(
    {
      status: 1,
      isAvailable: 1,
      category: 1,
    },
    { name: "menu_category_filter" },
  );

  // 3. ORDERS
  const orders = database.collection("orders");

  await orders.createIndex(
    { customerId: 1, createdAt: -1 },
    { name: "orders_customer_createdAt" },
  );

  await orders.createIndex(
    {
      vendorId: 1,
      status: 1,
      createdAt: -1,
    },
    { name: "orders_vendor_status_createdAt" },
  );

  await orders.createIndex(
    { activeOrderKey: 1 },
    {
      unique: true,
      partialFilterExpression: { activeOrderKey: { $type: "string" } },
      name: "orders_active_order_unique",
    },
  );

  // 4. TRANSACTIONS
  const transactions = database.collection("transactions");

  await transactions.createIndex(
    { vendorId: 1, createdAt: -1 },
    { name: "transactions_vendor_createdAt" },
  );

  await transactions.createIndex(
    { stripeSessionId: 1 },
    {
      unique: true,
      sparse: true,
      name: "transactions_stripe_session_unique",
    },
  );

  await transactions.createIndex(
    { stripeSubscriptionId: 1 },
    {
      sparse: true,
      name: "transactions_stripe_subscription_idx",
    },
  );

  await transactions.createIndex(
    { stripeInvoiceId: 1 },
    {
      unique: true,
      sparse: true,
      name: "transactions_stripe_invoice_unique",
    },
  );

  console.log("All PizzaHub database indexes are ready.");
};

let client;

try {
  client = await getMongoClient();
  await createIndexes();
} catch (error) {
  console.error("Index creation failed:", error);
  process.exitCode = 1;
} finally {
  // This is a one-off CLI process, not an API request. Close its own client
  // so the command exits cleanly. Runtime routes never close the shared pool.
  if (client) {
    await client.close().catch((error) => {
      console.error(
        "Could not close index-script MongoDB client:",
        error.message,
      );
      process.exitCode = 1;
    });
  }
}
