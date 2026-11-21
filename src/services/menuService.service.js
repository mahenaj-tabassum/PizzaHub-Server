export const GetMenuLocationsService = async (menuItems) => {
  const locations = await menuItems.distinct("location", {
    status: "approved",
    isAvailable: true,
  });

  return locations
    .filter(
      (location) => typeof location === "string" && location.trim().length > 0,
    )
    .map((location) => location.trim())
    .filter((location, index, array) => array.indexOf(location) === index)
    .sort((a, b) => a.localeCompare(b));
};
