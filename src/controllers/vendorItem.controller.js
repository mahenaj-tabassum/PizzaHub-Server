import { ObjectId } from "mongodb";
import { getCollection, getMongoClient } from "../config/db.js";

import {
  ACTIVE_MENU_ITEM_STATUSES,
  FREE_VENDOR_ACTIVE_ITEM_LIMIT,
  MENU_ITEM_STATUS,
  SUBSCRIPTION_PLANS,
} from "../utils/constants.js";

// Always take vendor identity from the authenticated database user.
// Never trust vendorId from request body or URL.
const getVendorId = (user) => String(user.id || user._id);

const getVendorDatabaseId = (user) => user._id;

const isValidItemId = (id) =>
  typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);

const isActivePremium = (vendor) => {
  const expiry = vendor.subscriptionExpiresAt;

  return (
    vendor.subscriptionPlan === SUBSCRIPTION_PLANS.PREMIUM &&
    expiry instanceof Date &&
    expiry.getTime() > Date.now()
  );
};

class VendorItemError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "VendorItemError";
    this.status = status;
  }
}

const sendVendorItemError = (res, error) =>
  res.status(error.status).json({
    success: false,
    message: error.message,
  });

// Every operation that can increase/decrease active item count
// writes to the vendor document inside the same transaction.
// This serializes concurrent quota-changing operations.
const lockVendorQuota = async (usersCollection, vendor, session) => {
  const result = await usersCollection.updateOne(
    { _id: vendor._id },
    {
      $inc: {
        menuItemQuotaVersion: 1,
      },
    },
    { session },
  );

  if (result.matchedCount !== 1) {
    throw new VendorItemError("Vendor account not found", 404);
  }
};

const countActiveVendorItems = async (menuCollection, vendorId, session) => {
  return menuCollection.countDocuments(
    {
      vendorId,
      status: { $in: ACTIVE_MENU_ITEM_STATUSES },
      isAvailable: true,
    },
    { session },
  );
};

const enforceVendorItemLimit = async ({
  vendor,
  vendorId,
  usersCollection,
  menuCollection,
  session,
}) => {
  // Must happen before counting, inside the same transaction.
  await lockVendorQuota(usersCollection, vendor, session);

  // Active Premium subscription has no item limit.
  if (isActivePremium(vendor)) {
    return;
  }

  const activeCount = await countActiveVendorItems(
    menuCollection,
    vendorId,
    session,
  );

  if (activeCount >= FREE_VENDOR_ACTIVE_ITEM_LIMIT) {
    throw new VendorItemError(
      "Free plan allows a maximum of 3 active menu items. Upgrade to Premium to add more.",
      403,
    );
  }
};

// Use this helper for all transaction-based quota operations.
// Session creation is inside try/catch at the controller level.
const runQuotaTransaction = async (client, callback) => {
  const session = client.startSession();

  try {
    return await session.withTransaction(() => callback(session), {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      readPreference: "primary",
    });
  } finally {
    await session.endSession();
  }
};

// -----------------------------------------------------------------------------
// POST /api/vendor/items
// Create a menu item. Pending items consume a Free-plan slot.
// -----------------------------------------------------------------------------
export const CreateMenuItem = async (req, res, next) => {
  try {
    const client = await getMongoClient();
    const vendorId = getVendorId(req.user);

    const usersCollection = await getCollection("users");
    const menuCollection = await getCollection("menuItems");

    const now = new Date();

    const newItem = {
      vendorId,
      itemName: req.body.itemName,
      category: req.body.category,
      description: req.body.description,
      price: req.body.price,
      location: req.body.location,
      images: req.body.images,

      status: MENU_ITEM_STATUS.PENDING,
      isAvailable: true,

      createdAt: now,
      updatedAt: now,
    };

    let insertedId;

    await runQuotaTransaction(client, async (session) => {
      // Read the latest subscription data inside the transaction.
      const vendor = await usersCollection.findOne(
        { _id: getVendorDatabaseId(req.user) },
        { session },
      );

      if (!vendor || vendor.role !== "vendor") {
        throw new VendorItemError("Vendor account not found", 404);
      }

      await enforceVendorItemLimit({
        vendor,
        vendorId,
        usersCollection,
        menuCollection,
        session,
      });

      const result = await menuCollection.insertOne(newItem, { session });
      insertedId = result.insertedId;
    });

    return res.status(201).json({
      success: true,
      message: "Menu item submitted for admin approval",
      data: {
        _id: insertedId,
        ...newItem,
      },
    });
  } catch (error) {
    if (error instanceof VendorItemError) {
      return sendVendorItemError(res, error);
    }

    return next(error);
  }
};

// -----------------------------------------------------------------------------
// GET /api/vendor/items
// Get only the authenticated vendor's own items.
// -----------------------------------------------------------------------------
export const GetMyMenuItem = async (req, res, next) => {
  try {
    const vendorId = getVendorId(req.user);
    const menuCollection = await getCollection("menuItems");

    const items = await menuCollection
      .find({ vendorId })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      message: "Your menu items retrieved successfully",
      data: items,
      totalItems: items.length,
    });
  } catch (error) {
    return next(error);
  }
};

// -----------------------------------------------------------------------------
// GET /api/vendor/items/:id
// Get one item only if it belongs to the authenticated vendor.
// -----------------------------------------------------------------------------
export const GetMySingleMenuItem = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidItemId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }

    const vendorId = getVendorId(req.user);
    const menuCollection = await getCollection("menuItems");

    const item = await menuCollection.findOne({
      _id: new ObjectId(id),
      vendorId,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Menu item retrieved successfully",
      data: item,
    });
  } catch (error) {
    return next(error);
  }
};

// -----------------------------------------------------------------------------
// PATCH /api/vendor/items/:id
// Content changes always reset status to pending.
// Inactive/deleted items cannot be edited or restored through this endpoint.
// -----------------------------------------------------------------------------
export const UpdateMenuItem = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidItemId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }

    const vendorId = getVendorId(req.user);
    const menuCollection = await getCollection("menuItems");

    const updates = {
      ...req.body,
      status: MENU_ITEM_STATUS.PENDING,
      updatedAt: new Date(),
    };

    const result = await menuCollection.updateOne(
      {
        _id: new ObjectId(id),
        vendorId,
        status: { $ne: MENU_ITEM_STATUS.INACTIVE },
      },
      {
        $set: updates,
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found or already deleted",
      });
    }

    const updatedItem = await menuCollection.findOne({
      _id: new ObjectId(id),
      vendorId,
    });

    return res.status(200).json({
      success: true,
      message: "Menu item updated and submitted for admin approval",
      data: updatedItem,
    });
  } catch (error) {
    return next(error);
  }
};

// -----------------------------------------------------------------------------
// DELETE /api/vendor/items/:id
// Soft delete. Deleted items no longer consume an active item slot.
// -----------------------------------------------------------------------------
export const DeleteMenuItem = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidItemId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }

    const vendorId = getVendorId(req.user);
    const menuCollection = await getCollection("menuItems");
    const now = new Date();

    const result = await menuCollection.updateOne(
      {
        _id: new ObjectId(id),
        vendorId,
        status: { $ne: MENU_ITEM_STATUS.INACTIVE },
      },
      {
        $set: {
          status: MENU_ITEM_STATUS.INACTIVE,
          isAvailable: false,
          deletedAt: now,
          updatedAt: now,
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found or already deleted",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Menu item deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};

// -----------------------------------------------------------------------------
// PATCH /api/vendor/items/:id/status
// Availability changes are quota-sensitive and must be transactional.
// -----------------------------------------------------------------------------
export const UpdateMenuItemAvailability = async (req, res, next) => {
  try {
    const client = await getMongoClient();
    const vendorId = getVendorId(req.user);
    const { id } = req.params;
    const { isAvailable } = req.body;

    if (!isValidItemId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }

    const usersCollection = await getCollection("users");
    const menuCollection = await getCollection("menuItems");

    let updatedItem;

    await runQuotaTransaction(client, async (session) => {
      const vendor = await usersCollection.findOne(
        { _id: getVendorDatabaseId(req.user) },
        { session },
      );

      if (!vendor || vendor.role !== "vendor") {
        throw new VendorItemError("Vendor account not found", 404);
      }

      const item = await menuCollection.findOne(
        {
          _id: new ObjectId(id),
          vendorId,
        },
        { session },
      );

      if (!item || item.status === MENU_ITEM_STATUS.INACTIVE) {
        throw new VendorItemError("Menu item not found", 404);
      }

      // Activating a pending/rejected item is not allowed.
      if (isAvailable && item.status !== MENU_ITEM_STATUS.APPROVED) {
        throw new VendorItemError(
          "Only admin-approved items can be activated",
          403,
        );
      }

      // Only a real transition from unavailable -> available consumes a slot.
      if (isAvailable && item.isAvailable !== true) {
        await enforceVendorItemLimit({
          vendor,
          vendorId,
          usersCollection,
          menuCollection,
          session,
        });
      } else {
        // Serialize deactivation and no-op activation with quota operations.
        await lockVendorQuota(usersCollection, vendor, session);
      }

      const result = await menuCollection.updateOne(
        {
          _id: new ObjectId(id),
          vendorId,
          status: item.status,
          isAvailable: item.isAvailable,
        },
        {
          $set: {
            isAvailable,
            updatedAt: new Date(),
          },
        },
        { session },
      );

      if (result.matchedCount !== 1) {
        throw new VendorItemError(
          "Menu item changed during this request. Please try again.",
          409,
        );
      }

      updatedItem = await menuCollection.findOne(
        {
          _id: new ObjectId(id),
          vendorId,
        },
        { session },
      );
    });

    return res.status(200).json({
      success: true,
      message: `Menu item ${isAvailable ? "activated" : "deactivated"} successfully`,
      data: updatedItem,
    });
  } catch (error) {
    if (error instanceof VendorItemError) {
      return sendVendorItemError(res, error);
    }

    return next(error);
  }
};
