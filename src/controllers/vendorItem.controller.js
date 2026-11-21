import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";
import { isValidObjectId } from "../utils/objectId.js";

const getVendorId = (user) => String(user.id || user._id);

// 1. Add Item -- POST: /api/vendor/items
export const CreateMenuItem = async (req, res, next) => {
  try {
    const vendorId = getVendorId(req.user);
    const { itemName, category, description, price, location, images } =
      req.body;

    // Required Field Validation
    if (
      !itemName?.trim() ||
      !category?.trim() ||
      !description?.trim() ||
      !location?.trim() ||
      !Array.isArray(images) ||
      images.length === 0 ||
      !Number.isFinite(Number(price)) ||
      Number(price) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required menu item fields",
      });
    }

    const menuCollection = await getCollection("menuItems");

    const newItem = {
      vendorId,
      itemName: itemName.trim(),
      category: category.trim(),
      description: description.trim(),
      price: Number(price),
      location: location.trim(),
      images,
      status: "pending",
      isAvailable: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await menuCollection.insertOne(newItem);

    res.status(201).json({
      success: true,
      message: "Menu item submitted for admin approval",
      data: {
        _id: result.insertedId,
        ...newItem,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 2. Get own items -- GET: /api/vendor/items
export const GetMyMenuItem = async (req, res, next) => {
  try {
    const vendorId = getVendorId(req.user);
    const menuCollection = await getCollection("menuItems");

    const items = await menuCollection
      .find({ vendorId })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      message: "Your menu items retrieved successfully",
      data: items,
    });
  } catch (error) {
    next(error);
  }
};

// 3. Get single item -- GET: /api/vendor/items/:id
export const GetMySingleMenuItem = async (req, res, next) => {
  try {
    const vendorId = getVendorId(req.user);
    const menuCollection = await getCollection("menuItems");
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    const item = await menuCollection.findOne({
      _id: new ObjectId(id),
      vendorId,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Menu Item not Found",
      });
    }

    res.status(200).json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
};
// 4. Update item -- PATCH: /api/vendor/items/:id
export const UpdateMenuItem = async (req, res, next) => {
  try {
    const menuCollection = await getCollection("menuItems");
    const vendorId = getVendorId(req.user);
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    // Only allow editable fields
    // Never accept vendorId, status or isAvailable from the body.
    const allowedFields = [
      "itemName",
      "category",
      "description",
      "location",
      "price",
      "images",
    ];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for updates",
      });
    }

    if (
      updates.price !== undefined &&
      (!Number.isFinite(Number(updates.price)) || Number(updates.price) <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Price must be a positive number",
      });
    }

    if (
      updates.images !== undefined &&
      (!Array.isArray(updates.images) || updates.images.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "At least one image is required",
      });
    }

    if (updates.price !== undefined) {
      updates.price = Number(updates.price);
    }

    for (const field of ["itemName", "category", "description", "location"]) {
      if (updates[field] !== undefined) {
        if (typeof updates[field] !== "string" || !updates[field].trim()) {
          return res.status(400).json({
            success: false,
            message: `${field} must be a non-empty string`,
          });
        }
        updates[field] = updates[field].trim();
      }
    }
    updates.updatedAt = new Date();

    const result = await menuCollection.updateOne(
      { _id: new ObjectId(id), vendorId },
      { $set: updates },
    );

    if (result.matchedCount === 0) {
      return res.status(400).json({
        success: false,
        message: "Menu item not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Menu item updated successfully",
    });
  } catch (error) {
    next(error);
  }
};
// 5. Delete Item -- DELETE: /api/vendor/items/:id
export const DeleteMenuItem = async (req, res, next) => {
  try {
    const menuCollection = await getCollection("menuItems");
    const vendorId = getVendorId(req.user);
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }
    const result = await menuCollection.deleteOne({
      _id: new ObjectId(id),
      vendorId,
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

// 6. Change Availability -- PATCH: /api/vendor/items/:id/status
export const UpdateMenuItemAvailability = async (req, res, next) => {
  try {
    const menuCollection = await getCollection("menuItems");
    const userCollection = await getCollection("users");
    const vendorId = getVendorId(req.user);
    const { id } = req.params;
    const { isAvailable } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }
    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isAvailable must be true or false",
      });
    }

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

    // Vendor can't activate an item that Admin has not approved
    if (isAvailable && item.status !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Only admin-approved items can be activated",
      });
    }

    if (isAvailable && !item.isAvailable) {
      const vendor = await userCollection.findOne({
        $or: [{ id: vendorId }, { _id: vendorId }],
      });
      if (!vendor) {
        return res.status(404).json({
          success: false,
          message: "Vendor account not found",
        });
      }
      if (vendor.subscriptionPlan !== "premium") {
        const activeCount = await menuCollection.countDocuments({
          vendorId,
          status: "approved",
          isAvailable: true,
        });
        if (activeCount >= 3) {
          return res.status(403).json({
            success: false,
            message:
              "Free plan allows a maximum of 3 active items. Upgrade to Premium to activate more.",
          });
        }
      }
    }
    await menuCollection.updateOne(
      { _id: new ObjectId(id), vendorId },
      { $set: { isAvailable, updatedAt: new Date() } },
    );

    res.status(200).json({
      success: true,
      message: `Menu item ${isAvailable ? "activated" : "deactivated"} successfully`,
    });
  } catch (error) {
    next(error);
  }
};
