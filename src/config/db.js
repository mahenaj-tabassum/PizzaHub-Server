import { MongoClient } from "mongodb";
import "dotenv/config";

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;
let clientPromise;

if (!uri) {
  throw new Error("MONGODB_URI is missing from environment variables");
}
if (!dbName) {
  throw new Error("DB_NAME is missing from environment variables");
}

const client = new MongoClient(uri);

const connectToMongoDB = async () => {
  try {
    if (!clientPromise) {
      clientPromise = client.connect();
    }
    await clientPromise;
    console.log("You successfully connected to MongoDB!");
    return client.db(dbName);
  } catch (err) {
    clientPromise = null;
	
    console.error("MongoDB connection failed:", err.message);
    throw err;
  }
};

const getCollection = async (collectionName) => {
  const database = await connectToMongoDB();
  return database.collection(collectionName);
};

export { connectToMongoDB, getCollection };
