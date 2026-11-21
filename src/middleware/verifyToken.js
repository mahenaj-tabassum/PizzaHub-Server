import { jwtVerify, createRemoteJWKSet } from "jose";
import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";

// Better Auth base URL
const authURL = process.env.BETTER_AUTH_URL;

if (!authURL) {
  throw new Error("BETTER_AUTH_URL is missing from environment variables");
}

// Remove trailing slash for consistent issuer/audience matching
const authBaseURL = authURL.replace(/\/+$/, "");

// Create JWKS resolver once and reuse it
const JWKS = createRemoteJWKSet(new URL("/api/auth/jwks", authBaseURL));

const unauthorized = (res, message) => {
  return res.status(401).json({
    success: false,
    message,
  });
};

const verifyToken = async (req, res, next) => {
  try {
    // 1. Read Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return unauthorized(res, "Unauthorized: Token is required");
    }

    // 2. Extract token
    const token = authHeader.slice(7).trim();

    if (!token) {
      return unauthorized(res, "Unauthorized: Token is missing");
    }

    // 3. Verify JWT signature, issuer, audience and expiration
    let payload;

    try {
      const result = await jwtVerify(token, JWKS, {
        issuer: authBaseURL,
        audience: authBaseURL,
      });

      payload = result.payload;
    } catch (error) {
      return unauthorized(res, "Unauthorized: Invalid or expired token");
    }

    // 4. Get authenticated user ID
    const userId = payload.sub;

    if (!userId || typeof userId !== "string") {
      return unauthorized(res, "Unauthorized: Invalid user identity");
    }

    // 5. Find current user in MongoDB
    const usersCollection = await getCollection("users");

    const conditions = [{ id: userId }, { _id: userId }];

    // Support MongoDB ObjectId-based user records too
    if (/^[0-9a-fA-F]{24}$/.test(userId)) {
      conditions.push({
        _id: new ObjectId(userId),
      });
    }

    const user = await usersCollection.findOne({
      $or: conditions,
    });

    if (!user) {
      return unauthorized(res, "Unauthorized: User not found");
    }

    // 6. Attach current database user
    req.user = user;

    // 7. Continue
    next();
  } catch (error) {
    next(error);
  }
};

export default verifyToken;
