// src/config/db.js

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;

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

const createClient = () => {
  return new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 60000,
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    retryWrites: true,
  });
};

const connectToMongoDB = async () => {
  if (mongo.client) {
    return mongo.client.db(dbName);
  }

  if (!mongo.promise) {
    const newClient = createClient();

    mongo.promise = newClient
      .connect()
      .then(() => {
        mongo.client = newClient;
        return newClient;
      })
      .catch(async (error) => {
        mongo.client = null;
        mongo.promise = null;

        await newClient.close().catch(() => {});

        console.error("MongoDB connection failed:", error.message);
        throw error;
      });
  }

  const connectedClient = await mongo.promise;

  return connectedClient.db(dbName);
};

const getMongoClient = async () => {
  await connectToMongoDB();

  return mongo.client;
};

const getCollection = async (collectionName) => {
  const database = await connectToMongoDB();

  return database.collection(collectionName);
};

// Only use this when intentionally shutting down,
// such as the database index creation script.
const closeDB = async () => {
  const currentClient = mongo.client;

  mongo.client = null;
  mongo.promise = null;

  if (currentClient) {
    await currentClient.close();
  }
};

export { connectToMongoDB, getMongoClient, getCollection, closeDB };
