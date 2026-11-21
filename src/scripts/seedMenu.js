import "dotenv/config";

import { getCollection, closeDB } from "../config/db.js";

const sampleMenuItems = [
  {
    itemName: "Margherita Pizza",
    category: "Classic Pizza",
    description:
      "Classic pizza with mozzarella cheese, tomato sauce and fresh basil.",
    price: 450,
    location: "NY, USA",
    images: ["https://images.unsplash.com/photo-1579751626657-72bc17010498"],
  },
  {
    itemName: "Pepperoni Pizza",
    category: "Classic Pizzas",
    description: "A classic pizza topped with mozzarella and pepperoni.",
    price: 650,
    location: "NY, USA",
    images: ["https://images.unsplash.com/photo-1628840042765-356cda07504e"],
  },
  {
    itemName: "BBQ Chicken Pizza",
    category: "Meat Lovers",
    description: "Smoky BBQ chicken with cheese, onion and barbecue sauce.",
    price: 750,
    location: "NY, USA",
    images: ["https://images.unsplash.com/photo-1565299624946-b28f40a0ae38"],
  },
  {
    itemName: "Veggie Supreme Pizza",
    category: "Vegetarian Pizzas",
    description: "Loaded with fresh vegetables, olives, capsicum and cheese.",
    price: 600,
    location: "NY, USA",
    images: ["https://images.unsplash.com/photo-1513104890138-7c749659a591"],
  },
  {
    itemName: "Four Cheese Pizza",
    category: "Specialty / Gourmet Pizzas",
    description: "A rich combination of four different cheeses.",
    price: 850,
    location: "NY, USA",
    images: ["https://images.unsplash.com/photo-1571407970349-bc81e7e96d47"],
  },
  {
    itemName: "Chicken Supreme Pizza",
    category: "Meat Lovers",
    description: "Chicken, sausage, capsicum, onion and mozzarella cheese.",
    price: 800,
    location: "NY, USA",
    images: ["https://images.unsplash.com/photo-1579751626657-72bc17010498"],
  },
  {
    itemName: "Garlic Bread",
    category: "Sides & Appetizers",
    description: "Freshly baked garlic bread with herbs and butter.",
    price: 180,
    location: "NY, USA",
    images: ["https://images.unsplash.com/photo-1619531040576-f9416740661f"],
  },
  {
    itemName: "Chicken Wings",
    category: "Sides & Appetizers",
    description: "Crispy chicken wings served with a flavorful sauce.",
    price: 320,
    location: "NY, USA",
    images: ["https://images.unsplash.com/photo-1527477396000-e27163b481c2"],
  },
  {
    itemName: "Chocolate Brownie",
    category: "Beverages & Desserts",
    description: "Rich chocolate brownie served as a sweet dessert.",
    price: 220,
    location: "NY, USA",
    images: ["https://images.unsplash.com/photo-1606313564200-e75d5e30476c"],
  },
  {
    itemName: "Cold Coffee",
    category: "Beverages & Desserts",
    description: "Chilled coffee blended with milk and ice.",
    price: 200,
    location: "NY, USA",
    images: ["https://images.unsplash.com/photo-1461023058943-07fcbe16d735"],
  },
];
const seedMenu = async () => {
  const vendorEmail = process.env.SEED_VENDOR_EMAIL?.trim().toLowerCase();

  if (!vendorEmail) {
    throw new Error("SEED_VENDOR_EMAIL is missing from .env");
  }

  const usersCollection = await getCollection("users");
  const menuCollection = await getCollection("menuItems");

  const vendor = await usersCollection.findOne({
    email: vendorEmail,
  });

  if (!vendor) {
    throw new Error(
      `Vendor not found: ${vendorEmail}. Register this user first.`,
    );
  }

  if (vendor.role !== "vendor") {
    throw new Error("The selected account does not have the vendor role.");
  }

  if (vendor.isBlocked === true) {
    throw new Error("A blocked vendor cannot own seed menu items.");
  }

  // Use the same user identifier convention as the controllers.
  const vendorId = String(vendor.id || vendor._id);

  const now = new Date();

  const operations = sampleMenuItems.map((item) => ({
    updateOne: {
      filter: {
        vendorId,
        itemName: item.itemName,
      },
      update: {
        $setOnInsert: {
          ...item,
          vendorId,
          status: "approved",
          isAvailable: true,
          createdAt: now,
          updatedAt: now,
        },
      },
      upsert: true,
    },
  }));

  const result = await menuCollection.bulkWrite(operations);

  console.log("Menu seeding completed.");
  console.log(`Vendor: ${vendorEmail}`);
  console.log(`New items inserted: ${result.upsertedCount}`);
  console.log(`Existing items matched: ${result.matchedCount}`);
};

try {
  await seedMenu();
} catch (error) {
  console.error("Menu seeding failed:", error.message);
  process.exitCode = 1;
} finally {
  await closeDB();
}
