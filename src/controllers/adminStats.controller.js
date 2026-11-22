import { getCollection } from "../config/db.js";

const CHART_MONTHS = 6;

// Last N months as { key: "2026-11", label: "Nov" }, oldest first (UTC).
const getRecentMonths = (count) => {
  const now = new Date();

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - (count - 1 - index),
        1,
      ),
    );

    return {
      key: date.toISOString().slice(0, 7),
      label: date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
    };
  });
};

// [{ _id: "pending", count: 3 }] -> { pending: 3, approved: 0, ... }
const toStatusMap = (rows, statuses) => {
  const result = Object.fromEntries(statuses.map((status) => [status, 0]));

  for (const row of rows) {
    if (row._id in result) result[row._id] = row.count;
  }

  return result;
};

// GET: /api/admin/stats
const GetAdminStats = async (req, res, next) => {
  try {
    const userCollection = await getCollection("users");
    const menuCollection = await getCollection("menuItems");
    const orderCollection = await getCollection("orders");
    const transactionCollection = await getCollection("transactions");

    const months = getRecentMonths(CHART_MONTHS);
    const since = new Date(`${months[0].key}-01T00:00:00.000Z`);

    const [
      totalUsers,
      totalVendors,
      totalCustomers,
      totalMenuItems,
      pendingMenuItems,
      totalTransactions,
      revenueRows,
      itemStatusRows,
      orderStatusRows,
    ] = await Promise.all([
      userCollection.countDocuments({}),
      userCollection.countDocuments({ role: "vendor" }),
      userCollection.countDocuments({ role: "customer" }),
      menuCollection.countDocuments({ deletedAt: null }),
      menuCollection.countDocuments({ status: "pending", deletedAt: null }),
      transactionCollection.countDocuments({}),

      // Revenue per month from completed payments only.
      transactionCollection
        .aggregate([
          {
            $match: {
              status: "completed",
              $expr: {
                $gte: [{ $ifNull: ["$paidAt", "$createdAt"] }, since],
              },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m",
                  date: { $ifNull: ["$paidAt", "$createdAt"] },
                },
              },
              amount: { $sum: "$amount" },
              payments: { $sum: 1 },
            },
          },
        ])
        .toArray(),

      menuCollection
        .aggregate([
          { $match: { deletedAt: null } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ])
        .toArray(),

      orderCollection
        .aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
        .toArray(),
    ]);

    const revenueByMonthMap = new Map(revenueRows.map((row) => [row._id, row]));

    // Months without payments are filled with zero so the chart has no gaps.
    // Stripe stores the smallest currency unit, so divide by 100.
    const revenueByMonth = months.map(({ key, label }) => {
      const row = revenueByMonthMap.get(key);

      return {
        month: label,
        revenue: row ? row.amount / 100 : 0,
        payments: row ? row.payments : 0,
      };
    });

    const totalRevenue = revenueByMonth.reduce(
      (sum, month) => sum + month.revenue,
      0,
    );

    return res.status(200).json({
      success: true,
      message: "Admin statistics retrieved successfully",
      data: {
        totalUsers,
        totalVendors,
        totalCustomers,
        totalMenuItems,
        pendingMenuItems,
        totalTransactions,

        // Chart data
        usersByRole: {
          vendors: totalVendors,
          customers: totalCustomers,
          admins: totalUsers - totalVendors - totalCustomers,
        },
        itemsByStatus: toStatusMap(itemStatusRows, [
          "pending",
          "approved",
          "rejected",
          "inactive",
        ]),
        ordersByStatus: toStatusMap(orderStatusRows, [
          "pending",
          "accepted",
          "rejected",
          "cancelled",
        ]),
        revenueByMonth,
        revenueLastMonths: totalRevenue,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default GetAdminStats;
