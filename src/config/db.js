// One MongoClient per Node.js process / warm Vercel function instance.
// Reuse the same connection pool across every request. Never close it per request.

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI?.trim();
const dbName = process.env.DB_NAME?.trim();

if (!uri) {
  throw new Error("MONGODB_URI is missing from environment variables");
}

if (!dbName) {
  throw new Error("DB_NAME is missing from environment variables");
}

const globalMongo = globalThis;

if (!globalMongo.__pizzaHubMongo) {
  globalMongo.__pizzaHubMongo = {
    client: null,
    promise: null,
  };
}

const mongo = globalMongo.__pizzaHubMongo;

const createClient = () =>
  new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
    socketTimeoutMS: 45_000,
    retryWrites: true,
  });

export const connectToMongoDB = async () => {
  if (mongo.client) {
    return mongo.client.db(dbName);
  }

  if (!mongo.promise) {
    const client = createClient();

    const connectionPromise = client
      .connect()
      .then((connectedClient) => {
        mongo.client = connectedClient;
        return connectedClient;
      })
      .catch(async (error) => {
        // Reset only this failed attempt. A later request can retry.
        if (mongo.promise === connectionPromise) {
          mongo.promise = null;
        }

        if (mongo.client === client) {
          mongo.client = null;
        }

        await client.close().catch(() => {});
        console.error("MongoDB connection failed:", error.message);
        throw error;
      });

    mongo.promise = connectionPromise;
  }

  const client = await mongo.promise;
  return client.db(dbName);
};

export const getMongoClient = async () => {
  await connectToMongoDB();

  if (!mongo.client) {
    throw new Error("MongoDB client is not available after connection");
  }

  return mongo.client;
};

export const getCollection = async (collectionName) => {
  if (typeof collectionName !== "string" || !collectionName.trim()) {
    throw new TypeError("A valid MongoDB collection name is required");
  }

  const database = await connectToMongoDB();
  return database.collection(collectionName);
};
