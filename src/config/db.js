import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;

if (!uri) {
  throw new Error("MONGODB_URI is missing from environment variables");
}

if (!dbName) {
  throw new Error("DB_NAME is missing from environment variables");
}

const client = new MongoClient(uri);

let clientPromise = null;

export const connectToMongoDB = async () => {
  if (!clientPromise) {
    clientPromise = (async () => {
      await client.connect();

      const database = client.db(dbName);

      // Verify that the connection is working.
      await database.command({ ping: 1 });

      console.log(`Connected to MongoDB database: ${dbName}`);

      return database;
    })().catch((error) => {
      clientPromise = null;
      console.error("MongoDB connection failed:", error.message);
      throw error;
    });
  }

  return clientPromise;
};

export const getCollection = async (collectionName) => {
  const allowedCollections = ["users", "menuItems", "orders", "transactions"];

  if (!allowedCollections.includes(collectionName)) {
    throw new Error(`Invalid business collection: ${collectionName}`);
  }

  const database = await connectToMongoDB();

  return database.collection(collectionName);
};

export const closeDB = async () => {
  if (!databasePromise) return;

  try {
    await client.close();
    console.log("MongoDB connection closed");
  } finally {
    databasePromise = null;
  }
};
