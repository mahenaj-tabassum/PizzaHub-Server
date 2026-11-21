import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";

const getCustomerId = (user) => String(user.id || user._id);

const isValidObjectId = (id) =>
  typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);

const createActiveOrderKey = (customerId, itemId, deliveryDate) =>
  JSON.stringify([customerId, itemId, deliveryDate]);

const findVendorById = async (usersCollection, vendorId) => {
  const conditions = [{ id: vendorId }, { _id: vendorId }];

  if (isValidObjectId(vendorId)) {
    conditions.push({ _id: new ObjectId(vendorId) });
  }

  return usersCollection.findOne({
    $or: conditions,
    role: "vendor",
  });
};

// -----------------------------------------------------------------------------
// POST /api/orders
// Create an order for an approved and available menu item.
// -----------------------------------------------------------------------------
export const CreateOrder = async (req, res, next) => {
  try {
    const { itemId, deliveryDate, deliveryAddress, message = "" } = req.body;

    if (!isValidObjectId(itemId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID",
      });
    }

    const customerId = getCustomerId(req.user);

    const menuCollection = await getCollection("menuItems");
    const usersCollection = await getCollection("users");
    const orderCollection = await getCollection("orders");
    const normalizedItemId = itemId.toLowerCase();
    // 1. Only approved and available items can be ordered.
    const item = await menuCollection.findOne({
      _id: new ObjectId(normalizedItemId),
      status: "approved",
      isAvailable: true,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found or unavailable",
      });
    }

    const vendorId = String(item.vendorId);

    // 2. Prevent a vendor from ordering their own menu item.
    if (vendorId === customerId) {
      return res.status(403).json({
        success: false,
        message: "You cannot order your own menu item",
      });
    }

    // 3. Verify that the referenced vendor still exists.
    const vendor = await findVendorById(usersCollection, vendorId);

    if (!vendor) {
      return res.status(409).json({
        success: false,
        message: "The vendor for this menu item is no longer available",
      });
    }

    // 4. Generate a deterministic key for duplicate active-order protection.
    const activeOrderKey = createActiveOrderKey(
      customerId,
      normalizedItemId,
      deliveryDate,
    );

    const now = new Date();

    // 5. Save item/vendor snapshots so order history remains meaningful
    // even if the menu item or vendor profile changes later.
    const newOrder = {
      itemId: normalizedItemId,

      vendorId,
      customerId,

      itemSnapshot: {
        itemName: item.itemName,
        category: item.category,
        price: item.price,
        images: Array.isArray(item.images) ? item.images : [],
        location: item.location,
      },

      vendorSnapshot: {
        name: vendor.name || "",
        businessName: vendor.businessName || "",
        image: vendor.image || null,
      },

      deliveryDate,
      deliveryAddress: deliveryAddress.trim(),
      message: typeof message === "string" ? message.trim() : "",

      status: "pending",
      activeOrderKey,

      createdAt: now,
      updatedAt: now,
    };

    // 6. The unique partial index is the final protection against
    // simultaneous duplicate requests.
    try {
      const result = await orderCollection.insertOne(newOrder);

      return res.status(201).json({
        success: true,
        message: "Order placed successfully",
        data: {
          _id: result.insertedId,
          ...newOrder,
        },
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message:
            "You already have an active order for this item and delivery date",
        });
      }

      throw error;
    }
  } catch (error) {
    return next(error);
  }
};

// -----------------------------------------------------------------------------
// GET /api/orders/my-orders
// Return only the authenticated customer's orders.
// -----------------------------------------------------------------------------
export const GetMyOrders = async (req, res, next) => {
  try {
    const customerId = getCustomerId(req.user);
    const orderCollection = await getCollection("orders");

    const orders = await orderCollection
      .find({ customerId })
      .sort({ createdAt: -1, _id: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      message: "Your orders retrieved successfully",
      data: orders,
      totalOrders: orders.length,
    });
  } catch (error) {
    return next(error);
  }
};

// -----------------------------------------------------------------------------
// GET /api/orders/:id
// Return an order only if it belongs to the authenticated customer.
// -----------------------------------------------------------------------------
export const GetOrderDetails = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const customerId = getCustomerId(req.user);
    const orderCollection = await getCollection("orders");

    const order = await orderCollection.findOne({
      _id: new ObjectId(id),
      customerId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order details retrieved successfully",
      data: order,
    });
  } catch (error) {
    return next(error);
  }
};

// -----------------------------------------------------------------------------
// PATCH /api/orders/:id/cancel
// Only the owner can cancel, and only while status is pending.
// -----------------------------------------------------------------------------
export const CancelOrder = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const customerId = getCustomerId(req.user);
    const orderCollection = await getCollection("orders");

    const result = await orderCollection.updateOne(
      {
        _id: new ObjectId(id),
        customerId,
        status: "pending",
      },
      {
        $set: {
          status: "cancelled",
          updatedAt: new Date(),
        },
        $unset: {
          activeOrderKey: "",
        },
      },
    );

    if (result.matchedCount === 0) {
      const existingOrder = await orderCollection.findOne({
        _id: new ObjectId(id),
        customerId,
      });

      if (!existingOrder) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      return res.status(409).json({
        success: false,
        message: `This order cannot be cancelled because its status is ${existingOrder.status}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    return next(error);
  }
};
