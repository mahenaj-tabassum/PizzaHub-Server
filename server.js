import "dotenv/config";

import app from "./src/app.js";
import { connectToMongoDB } from "./src/config/db.js";

const PORT = Number(process.env.PORT) || 5000;

async function startServer() {
  try {
    //  1. Connect to MongoDB first
    await connectToMongoDB();

    // 2. Start express server
    const server = app.listen(PORT, () => {
      console.log(`PizzaHub server running on http://localhost:${PORT}`);
    });

    // 3. Handle Server Startup errors
    server.on("error", (error) => {
      console.error("Server failed to start:", error.message);
      process.exit(1);
    });
  } catch (error) {
    console.error("Application startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
