// indexedDBStorage.js - IndexedDB storage for persistent image handling
// Stores images as blobs in IndexedDB for true persistence across sessions

const DB_NAME = "PuzzleImageStorage";
const DB_VERSION = 1;
const STORE_NAME = "images";

let db = null;

/**
 * Initialize IndexedDB database
 */
async function initIndexedDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("Failed to open IndexedDB:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log("IndexedDB initialized successfully");
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Create object store for images
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("filename", "filename", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
        console.log("Created IndexedDB object store");
      }
    };
  });
}

/**
 * Check if IndexedDB is supported
 */
export function isIndexedDBSupported() {
  return "indexedDB" in window;
}

/**
 * Store an image file in IndexedDB
 */
export async function storeImageInDB(file) {
  if (!isIndexedDBSupported()) {
    throw new Error("IndexedDB not supported");
  }

  try {
    await initIndexedDB();

    // Generate unique ID for the image
    const imageId = `img_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Convert file to blob if needed
    const blob = file instanceof Blob ? file : new Blob([file]);

    const imageData = {
      id: imageId,
      filename: file.name || "uploaded_image",
      blob: blob,
      size: blob.size,
      type: blob.type,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(imageData);

      request.onsuccess = () => {
        console.log(`Stored image in IndexedDB: ${imageId}`);
        resolve({
          imageId: imageId,
          filename: imageData.filename,
          size: imageData.size,
          type: imageData.type,
        });
      };

      request.onerror = () => {
        console.error("Failed to store image in IndexedDB:", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("Error storing image in IndexedDB:", error);
    throw error;
  }
}

/**
 * Load an image from IndexedDB by ID
 */
export async function loadImageFromDB(imageId) {
  if (!isIndexedDBSupported()) {
    throw new Error("IndexedDB not supported");
  }

  try {
    await initIndexedDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(imageId);

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          console.log(`Loaded image from IndexedDB: ${imageId}`);
          resolve({
            id: result.id,
            filename: result.filename,
            blob: result.blob,
            size: result.size,
            type: result.type,
            timestamp: result.timestamp,
          });
        } else {
          reject(new Error(`Image not found: ${imageId}`));
        }
      };

      request.onerror = () => {
        console.error("Failed to load image from IndexedDB:", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("Error loading image from IndexedDB:", error);
    throw error;
  }
}

/**
 * Delete an image from IndexedDB
 */
export async function deleteImageFromDB(imageId) {
  if (!isIndexedDBSupported()) {
    throw new Error("IndexedDB not supported");
  }

  try {
    await initIndexedDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(imageId);

      request.onsuccess = () => {
        console.log(`Deleted image from IndexedDB: ${imageId}`);
        resolve(true);
      };

      request.onerror = () => {
        console.error("Failed to delete image from IndexedDB:", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("Error deleting image from IndexedDB:", error);
    throw error;
  }
}

/**
 * List all stored images
 */
export async function listStoredImages() {
  if (!isIndexedDBSupported()) {
    throw new Error("IndexedDB not supported");
  }

  try {
    await initIndexedDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const images = request.result.map((item) => ({
          id: item.id,
          filename: item.filename,
          size: item.size,
          type: item.type,
          timestamp: item.timestamp,
        }));
        resolve(images);
      };

      request.onerror = () => {
        console.error("Failed to list images from IndexedDB:", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("Error listing images from IndexedDB:", error);
    throw error;
  }
}

/**
 * Clear all stored images (for cleanup)
 */
export async function clearAllImages() {
  if (!isIndexedDBSupported()) {
    throw new Error("IndexedDB not supported");
  }

  try {
    await initIndexedDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log("Cleared all images from IndexedDB");
        resolve(true);
      };

      request.onerror = () => {
        console.error("Failed to clear images from IndexedDB:", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("Error clearing images from IndexedDB:", error);
    throw error;
  }
}

/**
 * Get database usage statistics
 */
export async function getStorageStats() {
  if (!isIndexedDBSupported()) {
    return { supported: false };
  }

  try {
    const images = await listStoredImages();
    const totalSize = images.reduce((sum, img) => sum + img.size, 0);

    return {
      supported: true,
      imageCount: images.length,
      totalSize: totalSize,
      formattedSize: formatBytes(totalSize),
    };
  } catch (error) {
    console.error("Error getting storage stats:", error);
    return { supported: true, error: error.message };
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
