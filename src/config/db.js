import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;

if (!uri) {
  throw new Error("MONGODB_URI is missing from environment variables");
}

if (!dbName) {
  throw new Error("DB_NAME is missing from environment variables");
}

let client = null;
let clientPromise = null;

const createClient = () => {
  const newClient = new MongoClient(uri, {
    maxPoolSize: 5,
    minPoolSize: 0,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
    socketTimeoutMS: 45000,
  });

  // Driver client বন্ধ করলে cache মুছে দিই, পরের কলে নতুন client হবে।
  newClient.on("topologyClosed", () => {
    if (client === newClient) {
      client = null;
      clientPromise = null;
    }
  });

  return newClient;
};

const connectToMongoDB = async () => {
  if (!client) {
    client = createClient();
    const current = client;

    clientPromise = current.connect().catch((error) => {
      if (client === current) {
        client = null;
        clientPromise = null;
      }
      current.close().catch(() => {});
      throw error;
    });
  }

  try {
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
  if (client) {
    await client.close();
  }
  client = null;
  clientPromise = null;
};

export { connectToMongoDB, getMongoClient, getCollection, closeDB };
