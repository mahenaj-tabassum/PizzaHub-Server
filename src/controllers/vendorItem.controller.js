import { ObjectId } from "mongodb";

import { getCollection, getMongoClient } from "../config/db.js";

import {
  ACTIVE_MENU_ITEM_STATUSES,
  FREE_VENDOR_ACTIVE_ITEM_LIMIT,
  MENU_ITEM_STATUS,
  SUBSCRIPTION_PLANS,
} from "../utils/constants.js";

// Authenticated vendor identity.
// Never use vendorId from req.body.
const getVendorId = (user) => {
  return String(user.id || user._id);
};

const getVendorDatabaseId = (user) => user._id;

const isActivePremium = (vendor) => {
  return (
    vendor.subscriptionPlan === SUBSCRIPTION_PLANS.PREMIUM &&
    vendor.subscriptionExpiresAt instanceof Date &&
    vendor.subscriptionExpiresAt > new Date()
  );
};

const isValidItemId = (id) => {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
};

class VendorItemError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "VendorItemError";
    this.status = status;
  }
}

// Lock the vendor document inside the transaction.
// Concurrent quota-changing operations for this vendor
// will conflict and MongoDB can retry the transaction.
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

// Check whether this vendor can add one more active listing.
const enforceVendorItemLimit = async ({
  vendor,
  vendorId,
  usersCollection,
  menuCollection,
  session,
}) => {
  // Lock first so simultaneous requests cannot both
  // pass the same count check.
  await lockVendorQuota(usersCollection, vendor, session);

  // Premium vendors have no active item limit.
  if (isActivePremium(vendor)) {
    return;
  }

  const activeCount = await menuCollection.countDocuments(
    {
      vendorId,
      status: {
        $in: ACTIVE_MENU_ITEM_STATUSES,
      },
      isAvailable: true,
    },
    { session },
  );

  if (activeCount >= FREE_VENDOR_ACTIVE_ITEM_LIMIT) {
    throw new VendorItemError(
      "Free plan allows a maximum of 3 active menu items. Upgrade to Premium to add more.",
      403,
    );
  }
};

// 1. Create item
// POST /api/vendor/items
export const CreateMenuItem = async (req, res, next) => {
  const client = await getMongoClient();
  const session = client.startSession();

  try {
    const vendorId = getVendorId(req.user);

    const usersCollection = await getCollection("users");
    const menuCollection = await getCollection("menuItems");

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

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    let insertedId;

    await session.withTransaction(async () => {
      // Always load the latest vendor record from DB.
      const vendor = await usersCollection.findOne(
        { _id: getVendorDatabaseId(req.user) },
        { session },
      );

      if (!vendor) {
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
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
};

// 2. Get vendor's own items
// GET /api/vendor/items
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
    next(error);
  }
};

// 3. Get one vendor-owned item
// GET /api/vendor/items/:id
export const GetMySingleMenuItem = async (req, res, next) => {
  try {
    const vendorId = getVendorId(req.user);
    const { id } = req.params;

    if (!isValidItemId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }

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
    next(error);
  }
};

// 4. Update vendor-owned item
// PATCH /api/vendor/items/:id
export const UpdateMenuItem = async (req, res, next) => {
  try {
    const vendorId = getVendorId(req.user);
    const { id } = req.params;

    if (!isValidItemId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }

    const menuCollection = await getCollection("menuItems");

    // Only validated content fields can reach this controller.
    const updates = {
      ...req.body,
      updatedAt: new Date(),

      // Any content change requires admin re-approval.
      status: MENU_ITEM_STATUS.PENDING,
    };

    const result = await menuCollection.updateOne(
      {
        _id: new ObjectId(id),
        vendorId,
      },
      {
        $set: updates,
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found",
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
    next(error);
  }
};

// 5. Soft delete item
// DELETE /api/vendor/items/:id
export const DeleteMenuItem = async (req, res, next) => {
  try {
    const vendorId = getVendorId(req.user);
    const { id } = req.params;

    if (!isValidItemId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }

    const menuCollection = await getCollection("menuItems");

    const result = await menuCollection.updateOne(
      {
        _id: new ObjectId(id),
        vendorId,
        status: {
          $ne: MENU_ITEM_STATUS.INACTIVE,
        },
      },
      {
        $set: {
          status: MENU_ITEM_STATUS.INACTIVE,
          isAvailable: false,
          deletedAt: new Date(),
          updatedAt: new Date(),
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
    next(error);
  }
};

// 6. Update item availability
// PATCH /api/vendor/items/:id/status
export const UpdateMenuItemAvailability = async (req, res, next) => {
  const client = await getMongoClient();
  const session = client.startSession();

  try {
    const vendorId = getVendorId(req.user);
    const { id } = req.params;
    const { isAvailable } = req.body;

    if (!isValidItemId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }

    const menuCollection = await getCollection("menuItems");
    const usersCollection = await getCollection("users");

    let updatedItem;

    await session.withTransaction(async () => {
      const vendor = await usersCollection.findOne(
        { _id: getVendorDatabaseId(req.user) },
        { session },
      );

      if (!vendor) {
        throw new VendorItemError("Vendor account not found", 404);
      }

      const item = await menuCollection.findOne(
        {
          _id: new ObjectId(id),
          vendorId,
        },
        { session },
      );

      if (!item) {
        throw new VendorItemError("Menu item not found", 404);
      }

      if (isAvailable && item.status !== MENU_ITEM_STATUS.APPROVED) {
        throw new VendorItemError(
          "Only admin-approved items can be activated",
          403,
        );
      }

      // Only activating an unavailable item consumes a new slot.
      if (isAvailable && !item.isAvailable) {
        await enforceVendorItemLimit({
          vendor,
          vendorId,
          usersCollection,
          menuCollection,
          session,
        });
      } else {
        // Serialize deactivation with other quota operations too.
        await lockVendorQuota(usersCollection, vendor, session);
      }

      await menuCollection.updateOne(
        {
          _id: new ObjectId(id),
          vendorId,
        },
        {
          $set: {
            isAvailable,
            updatedAt: new Date(),
          },
        },
        { session },
      );

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
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
};
