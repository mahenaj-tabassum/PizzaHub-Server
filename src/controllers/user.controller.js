import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";
import { ROLES } from "../utils/constants.js";

// Build a query for the authenticated Better Auth user.
const getAuthenticatedUserQuery = (user) => {
  if (user?._id instanceof ObjectId) {
    return { _id: user._id };
  }

  if (typeof user?._id === "string" && user._id) {
    return { _id: user._id };
  }

  if (typeof user?.id === "string" && user.id) {
    return { id: user.id };
  }

  return null;
};

// Never return authentication or internal sensitive fields.
const PROFILE_PROJECTION = {
  name: 1,
  email: 1,
  image: 1,
  role: 1,
  businessName: 1,
  isBlocked: 1,
  subscriptionPlan: 1,
  subscriptionExpiresAt: 1,
  createdAt: 1,
  updatedAt: 1,
};

// GET /api/users/me
export const GetMyProfile = async (req, res, next) => {
  try {
    const userQuery = getAuthenticatedUserQuery(req.user);

    if (!userQuery) {
      return res.status(401).json({
        success: false,
        message: "Unable to identify authenticated user",
      });
    }

    const usersCollection = await getCollection("users");

    const user = await usersCollection.findOne(userQuery, {
      projection: PROFILE_PROJECTION,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile retrieved successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/users/me
export const UpdateMyProfile = async (req, res, next) => {
  try {
    const userQuery = getAuthenticatedUserQuery(req.user);

    if (!userQuery) {
      return res.status(401).json({
        success: false,
        message: "Unable to identify authenticated user",
      });
    }

    const { name, image, businessName } = req.body;

    // Only vendors may update their restaurant business name.
    if (businessName !== undefined && req.user.role !== ROLES.VENDOR) {
      return res.status(403).json({
        success: false,
        message: "Only vendors can update business name",
      });
    }

    const updateFields = {
      updatedAt: new Date(),
    };

    if (name !== undefined) {
      updateFields.name = name;
    }

    if (image !== undefined) {
      updateFields.image = image;
    }

    if (businessName !== undefined) {
      updateFields.businessName = businessName;
    }

    const usersCollection = await getCollection("users");

    const updateResult = await usersCollection.updateOne(userQuery, {
      $set: updateFields,
    });

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    const updatedUser = await usersCollection.findOne(userQuery, {
      projection: PROFILE_PROJECTION,
    });

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};
