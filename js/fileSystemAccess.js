// fileSystemAccess.js - File System Access API integration for persistent image handling
// Provides functionality to store and retrieve local image files using the File System Access API

/**
 * Check if File System Access API is supported
 * @returns {boolean} true if supported
 */
export function isFileSystemAccessSupported() {
  return "showOpenFilePicker" in window && "showSaveFilePicker" in window;
}

/**
 * Store an image file using File System Access API
 * Creates a copy of the selected file in a location that can be accessed later
 * @param {File} originalFile - The original file selected by the user
 * @returns {Promise<{fileHandle: FileSystemFileHandle, source: string}>} File handle and source info
 */
export async function storeImageFile(originalFile) {
  if (!isFileSystemAccessSupported()) {
    throw new Error("File System Access API is not supported in this browser");
  }

  try {
    // Show save file picker to let user choose where to store the copy
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: `puzzle_${originalFile.name}`,
      types: [
        {
          description: "Image files",
          accept: {
            "image/jpeg": [".jpg", ".jpeg"],
            "image/png": [".png"],
          },
        },
      ],
    });

    // Create a writable stream and copy the file
    const writable = await fileHandle.createWritable();
    await writable.write(originalFile);
    await writable.close();

    return {
      fileHandle,
      source: `fsapi:${originalFile.name}`, // Mark as File System Access API source
      originalName: originalFile.name,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("File storage was cancelled by user");
    }
    throw new Error(`Failed to store image file: ${error.message}`);
  }
}

/**
 * Load an image file using stored file handle
 * @param {FileSystemFileHandle} fileHandle - Previously stored file handle
 * @returns {Promise<File>} The file object
 */
export async function loadImageFile(fileHandle) {
  if (!isFileSystemAccessSupported()) {
    throw new Error("File System Access API is not supported in this browser");
  }

  try {
    // Verify we still have permission to read the file
    const permission = await fileHandle.queryPermission({ mode: "read" });
    if (permission !== "granted") {
      // Request permission if not already granted
      const newPermission = await fileHandle.requestPermission({
        mode: "read",
      });
      if (newPermission !== "granted") {
        throw new Error("Permission to access the file was denied");
      }
    }

    const file = await fileHandle.getFile();
    return file;
  } catch (error) {
    throw new Error(`Failed to load image file: ${error.message}`);
  }
}

/**
 * Request permission to access a stored file
 * @param {FileSystemFileHandle} fileHandle - File handle to check
 * @returns {Promise<boolean>} true if permission is granted
 */
export async function requestFilePermission(fileHandle) {
  if (!isFileSystemAccessSupported() || !fileHandle) {
    return false;
  }

  try {
    const permission = await fileHandle.queryPermission({ mode: "read" });
    if (permission === "granted") {
      return true;
    }

    const newPermission = await fileHandle.requestPermission({ mode: "read" });
    return newPermission === "granted";
  } catch (error) {
    console.warn("[fileSystemAccess] Failed to request permission:", error);
    return false;
  }
}

/**
 * Serialize a file handle for storage
 */
export function serializeFileHandle(fileHandle) {
  if (!fileHandle) return null;

  // File handles are not directly serializable, but we can store a reference
  // The actual FileSystemFileHandle will need to be re-requested from the user
  return {
    name: fileHandle.name,
    kind: fileHandle.kind,
    // Note: We cannot actually serialize the handle itself
    // This is just metadata for user information
    timestamp: Date.now(),
  };
}

/**
 * Deserialize a file handle from storage
 * Note: This cannot actually restore the file handle - it just returns the metadata
 * The file will need to be re-selected by the user
 */
export function deserializeFileHandle(serializedHandle) {
  if (!serializedHandle) return null;

  // We cannot actually deserialize a FileSystemFileHandle
  // This function is for completeness and potential future browser support
  console.warn(
    "Cannot deserialize FileSystemFileHandle - file access requires user permission"
  );
  return serializedHandle;
}

/**
 * Show file picker to select an image file
 * @returns {Promise<{file: File, fileHandle: FileSystemFileHandle}>} Selected file and handle
 */
export async function pickImageFile() {
  if (!isFileSystemAccessSupported()) {
    throw new Error("File System Access API is not supported in this browser");
  }

  try {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [
        {
          description: "Image files",
          accept: {
            "image/jpeg": [".jpg", ".jpeg"],
            "image/png": [".png"],
          },
        },
      ],
      multiple: false,
    });

    const file = await fileHandle.getFile();
    return { file, fileHandle };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("File selection was cancelled by user");
    }
    throw new Error(`Failed to pick image file: ${error.message}`);
  }
}
