import { vendorLookupStages } from "./menuVendor.service.js";

// পাবলিক /api/menu-এর মতোই: শুধু approved ও available আইটেম,
// এবং blocked বা মুছে যাওয়া vendor-এর আইটেম বাদ।
export const GetMenuLocationsService = async (menuItems) => {
  const rows = await menuItems
    .aggregate([
      { $match: { status: "approved", isAvailable: true } },
      ...vendorLookupStages(),
      { $group: { _id: "$location" } },
    ])
    .toArray();

  return rows
    .map((row) => row._id)
    .filter(
      (location) => typeof location === "string" && location.trim().length > 0,
    )
    .map((location) => location.trim())
    .filter((location, index, array) => array.indexOf(location) === index)
    .sort((a, b) => a.localeCompare(b));
};
