import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";
import { isValidDeliveryDate } from "../utils/dateValidation.js";
import { isValidObjectId } from "../utils/objectId.js";
const getCustomerId = (user) => String(user.id || user._id);

// 1. Create Order  -- POST: /api/orders
export const CreateOrder = async (req, res, next) => {
  try {
    const menuCollection = await getCollection("menuItems");
    const orderCollection = await getCollection("orders");
    const customerId = getCustomerId(req.user);
    const { itemId, deliveryDate, deliveryAddress, message = "" } = req.body;

    // Validate required fields
    if (
      typeof itemId !== "string" ||
      !/^[0-9a-fA-F]{24}$/.test(itemId) ||
      typeof deliveryDate !== "string" ||
      !isValidDeliveryDate(deliveryDate) ||
      typeof deliveryAddress !== "string" ||
      !deliveryAddress.trim() ||
      typeof message !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid order information",
      });
    }

    // Find approved and available menu item
    const item = await menuCollection.findOne({
      _id: new ObjectId(itemId),
      status: "approved",
      isAvailable: true,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found or unavailable",
      });
    }

    // Prevent ordering your own menu item
    if (String(item.vendorId) === customerId) {
      return res.status(403).json({
        success: false,
        message: "You cannot order your own menu item",
      });
    }

    // Prevent duplicate active orders for the same item and date.
    // Pending and accepted orders are considered active.
    const existingOrder = await orderCollection.findOne({
      itemId,
      customerId,
      deliveryDate,
      status: { $in: ["pending", "accepted"] },
    });
    if (existingOrder) {
      return res.status(409).json({
        success: false,
        message:
          "You already have an active order for this item and delivery date",
      });
    }

    const newOrder = {
      itemId,
      vendorId: String(item.vendorId),
      customerId,
      deliveryDate,
      deliveryAddress: deliveryAddress.trim(),
      message: message.trim(),
      status: "pending",
      createdAt: new Date(),
    };
    const result = await orderCollection.insertOne(newOrder);

    res.status(201).json({
      success: true,
      message: "Order Placed Successfully!",
      data: {
        _id: result.insertedId,
        ...newOrder,
      },
    });
  } catch (error) {
    next(error);
  }
};
// 2. Get own orders  -- GET: /api/orders/my-orders
export const GetMyOrders = async (req, res, next) => {
  try {
    const customerId = getCustomerId(req.user);
    const orderCollection = await getCollection("orders");

    const orders = await orderCollection
      .find({ customerId })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      message: "Your orders retrieved successfully",
      data: orders,
    });
  } catch (error) {
    next(error);
  }
};
// 3. Get single order details  -- GET: /api/orders/:id
export const GetOrderDetails = async (req, res, next) => {
  try {
    const customerId = getCustomerId(req.user);
    const orderCollection = await getCollection("orders");
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    // Customer can only find their own order
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

    res.status(200).json({
      success: true,
      message: "Order details retrieved successfully",
      data: order,
    });
  } catch (error) {
    next(error);
  }
};
// 4. Cancel Pending Order  --  PATCH: /api/orders/:id/cancel
export const CancelOrder = async (req, res, next) => {
  try {
    const orderCollection = await getCollection("orders");
    const customerId = getCustomerId(req.user);
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    // Cancel only if the order belongs to this customer
    // and its current status is pending
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
      },
    );
    if (result.matchedCount === 0) {
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
      return res.status(409).json({
        success: false,
        message: "Only pending orders can be cancelled",
      });
    }
    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    next(error);
  }
};
