import { ObjectId } from "mongodb";
import { getCollection, getMongoClient } from "../config/db.js";
import {
  ACTIVE_MENU_ITEM_STATUSES,
  FREE_VENDOR_ACTIVE_ITEM_LIMIT,
  SUBSCRIPTION_PLANS,
} from "../utils/constants.js";
import { adminVendorInfoStages } from "../services/menuVendor.service.js";

const isValidId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

const findItemById = async (id) => {
  if (!isValidId(id)) return null;
  const collection = await getCollection("menuItems");
  return collection.findOne({ _id: new ObjectId(id) });
};

// GET: /api/admin/items
// Get all menu items with search, status filter and pagination
export const GetAllMenuItems = async (req, res, next) => {
  try {
    const { q = "", status, page = "1", limit = "10" } = req.query;
    const currentPage = Number(page);
    const perPage = Number(limit);
    const safeLimit = Math.min(perPage, 50);
    const skip = (currentPage - 1) * safeLimit;
    const filters = [{ deletedAt: null }];
    const menuCollection = await getCollection("menuItems");

    if (typeof q !== "string") {
      return res.status(400).json({
        success: false,
        message: "Search query must be a string",
      });
    }

    const allowedStatuses = ["pending", "approved", "rejected", "inactive"];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item status",
      });
    }

    if (
      !Number.isInteger(currentPage) ||
      currentPage < 1 ||
      !Number.isInteger(perPage) ||
      perPage < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination values",
      });
    }

    if (status) {
      filters.push({ status });
    }

    if (q.trim()) {
      const searchRegex = {
        $regex: q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      };

      filters.push({
        $or: [
          { itemName: searchRegex },
          { category: searchRegex },
          { location: searchRegex },
        ],
      });
    }

    const query = filters.length ? { $and: filters } : {};

    const [items, totalItems] = await Promise.all([
      menuCollection
        .aggregate([
          { $match: query },
          { $sort: { createdAt: -1, _id: -1 } },
          { $skip: skip },
          { $limit: safeLimit },
          // Lookup only for the items on this page.
          ...adminVendorInfoStages(),
        ])
        .toArray(),
      menuCollection.countDocuments(query),
    ]);
    res.status(200).json({
      success: true,
      message: "Menu items retrieved successfully",
      data: items,
      pagination: {
        currentPage,
        limit: safeLimit,
        totalItems,
        totalPages: Math.ceil(totalItems / safeLimit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// PATCH: /api/admin/items/:id/approve
// Only pending items can be approved.
export const ApproveMenuItem = async (req, res, next) => {
  try {
    const menuCollection = await getCollection("menuItems");
    const id = req.params.id;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }
    const result = await menuCollection.updateOne(
      {
        _id: new ObjectId(id),
        status: "pending",
      },
      {
        $set: {
          status: "approved",
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      const item = await findItemById(id);
      return res.status(item ? 409 : 404).json({
        success: false,
        message: item
          ? "Only pending items can be approved"
          : "Menu item not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Menu item approved successfully",
    });
  } catch (error) {
    next(error);
  }
};

// PATCH: /api/admin/items/:id/reject
// Only pending items can be rejected
export const RejectMenuItem = async (req, res, next) => {
  try {
    const menuCollection = await getCollection("menuItems");
    const id = req.params.id;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }

    const result = await menuCollection.updateOne(
      {
        _id: new ObjectId(id),
        status: "pending",
      },
      {
        $set: {
          status: "rejected",
          updatedAt: new Date(),
        },
      },
    );
    if (result.matchedCount === 0) {
      const item = await findItemById(id);

      return res.status(item ? 409 : 404).json({
        success: false,
        message: item
          ? "Only pending items can be rejected"
          : "Menu item not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Menu item rejected successfully",
    });
  } catch (error) {
    next(error);
  }
};

// PATCH: /api/admin/items/:id/status
// Admin can change an item's publication status.
export const UpdateMenuItemStatus = async (req, res, next) => {
  let session;

  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }

    const allowedStatuses = ["approved", "inactive"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be approved or inactive",
      });
    }

    const client = await getMongoClient();
    const menuCollection = await getCollection("menuItems");
    const usersCollection = await getCollection("users");
    session = client.startSession();

    await session.withTransaction(
      async () => {
        const item = await menuCollection.findOne(
          { _id: new ObjectId(id), deletedAt: null },
          { session },
        );

        if (!item) {
          const error = new Error("Menu item not found");
          error.statusCode = 404;
          throw error;
        }

        if (!["approved", "inactive"].includes(item.status)) {
          const error = new Error(
            "Only approved or inactive items can be changed here",
          );
          error.statusCode = 409;
          throw error;
        }

        const wasCounted =
          ACTIVE_MENU_ITEM_STATUSES.includes(item.status) &&
          item.isAvailable === true;
        const willBeCounted =
          ACTIVE_MENU_ITEM_STATUSES.includes(status) &&
          item.isAvailable === true;

        if (willBeCounted && !wasCounted) {
          // Resolve the vendor using the same identities supported elsewhere.
          const vendor = await usersCollection.findOne(
            {
              role: "vendor",
              $or: [
                { id: String(item.vendorId) },
                { _id: String(item.vendorId) },
                ...(/^[0-9a-fA-F]{24}$/.test(String(item.vendorId))
                  ? [{ _id: new ObjectId(String(item.vendorId)) }]
                  : []),
              ],
            },
            { session },
          );

          if (!vendor) {
            const error = new Error("Menu item vendor account was not found");
            error.statusCode = 409;
            throw error;
          }

          // A write to the vendor document serializes this admin action with
          // vendor create/update/availability quota transactions.
          await usersCollection.updateOne(
            { _id: vendor._id },
            { $inc: { menuItemQuotaVersion: 1 } },
            { session },
          );

          const expiry = vendor.subscriptionExpiresAt
            ? new Date(vendor.subscriptionExpiresAt)
            : null;
          const hasActivePremium =
            vendor.subscriptionPlan === SUBSCRIPTION_PLANS.PREMIUM &&
            expiry instanceof Date &&
            !Number.isNaN(expiry.getTime()) &&
            expiry > new Date();

          if (!hasActivePremium) {
            const activeCount = await menuCollection.countDocuments(
              {
                vendorId: String(item.vendorId),
                status: { $in: ACTIVE_MENU_ITEM_STATUSES },
                isAvailable: true,
              },
              { session },
            );

            if (activeCount >= FREE_VENDOR_ACTIVE_ITEM_LIMIT) {
              const error = new Error(
                "This vendor has reached the Free plan limit of 3 active menu items. Upgrade to Premium or deactivate another item first.",
              );
              error.statusCode = 409;
              throw error;
            }
          }
        }

        const result = await menuCollection.updateOne(
          {
            _id: item._id,
            deletedAt: null,
            status: item.status,
            isAvailable: item.isAvailable,
          },
          { $set: { status, updatedAt: new Date() } },
          { session },
        );

        if (result.matchedCount !== 1) {
          const error = new Error(
            "Menu item changed during this request. Please try again.",
          );
          error.statusCode = 409;
          throw error;
        }
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
      },
    );

    return res.status(200).json({
      success: true,
      message: `Menu item status updated to ${status}`,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return next(error);
  } finally {
    if (session) await session.endSession();
  }
};

// DELETE: /api/admin/items/:id

export const DeleteMenuItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const menuCollection = await getCollection("menuItems");

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }

    const result = await menuCollection.deleteOne({
      _id: new ObjectId(id),
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Menu item deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
