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

const connectToMongoDB = async () => {
  try {
    if (!clientPromise) {
      clientPromise = client.connect().catch((error) => {
        clientPromise = null;
        throw error;
      });
    }

    await clientPromise;

    return client.db(dbName);
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
};

const getMongoClient = async () => {
  await connectToMongoDB();
  return client;
};

const getCollection = async (collectionName) => {
  const database = await connectToMongoDB();
  return database.collection(collectionName);
};

const closeDB = async () => {
  await client.close();
  clientPromise = null;
};

export { connectToMongoDB, getMongoClient, getCollection, closeDB };
