import { ObjectId } from "mongodb";

// Check whether a value is a valid MongoDB ObjectId string

export const isValidObjectId = (id) => {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
};

// Convert Valid string into MongoDB ObjectId
export const toObjectId = (id) => {
  if (!isValidObjectId(id)) return null;
  return new ObjectId(id);
};

// Build a MongoDB _id query
export const buildObjectQuery = (id) => {
  const objectId = toObjectId(id);

  if (!objectId) return null;

  return { _id: objectId };
};
