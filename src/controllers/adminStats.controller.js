import { getCollection } from "../config/db.js";

// GET: /api/admin/stats
const GetAdminStats = async (req, res, next) => {
  try {
    const userCollection = await getCollection("users");
    const menuCollection = await getCollection("menuItems");
    const transactionCollection = await getCollection("transactions");

    const [
      totalUsers,
      totalVendors,
      totalCustomers,
      totalMenuItems,
      pendingMenuItems,
      totalTransactions,
    ] = await Promise.all([
      userCollection.countDocuments({}),
      userCollection.countDocuments({ role: "vendor" }),
      userCollection.countDocuments({ role: "customer" }),
      menuCollection.countDocuments({}),
      menuCollection.countDocuments({ status: "pending" }),
      transactionCollection.countDocuments({}),
    ]);

    res.status(200).json({
      success: true,
      message: "Admin statistics retrieved successfully",
      data: {
        totalUsers,
        totalVendors,
        totalCustomers,
        totalMenuItems,
        pendingMenuItems,
        totalTransactions,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default GetAdminStats;
