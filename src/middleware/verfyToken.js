import { jwtVerify, createRemoteJWKSet } from "jose";
import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";

const authURL = process.env.BETTER_AUTH_URL;

if (!authURL) {
  throw new Error("BETTER_AUTH_URL is missing");
}
// Create JWKS resolver once and reuse it.
const JWKS = createRemoteJWKSet(new URL("/api/auth/jwks", authURL));

const verifyToken = async (req, res, next) => {
  try {
    // 1. Get Authorization Header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Token is required",
      });
    }

    // 2. Extract Token
    const token = authHeader.slice(7).trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Token is missing",
      });
    }

    // 3. Verify JWT
    let payload;
    try {
      const result = await jwtVerify(token, JWKS, {
        issuer: authURL,
        audience: authURL,
      });

      payload = result.payload;
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid or expired token",
      });
    }
    // Get Verified UserID
    const userId = payload.sub;

    if (!userId || typeof userId !== "string") {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid user identity",
      });
    }

    // 5. Find actual user in MongoDB
    const usersCollection = await getCollection("users");
    const conditions = [{ _id: userId }, { id: userId }];

    // Also support databases where _id is stored as ObjectID
    if (ObjectId.isValid(userId)) {
      conditions.push({ _id: new ObjectId(userId) });
    }
    const user = await usersCollection.findOne({
      $or: conditions,
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found",
      });
    }

    // 6. Attach actual database user
    req.user = user;

    // 7. Continue to next middleware
    next();
  } catch (error) {
    next(error);
  }
};
