#!/usr/bin/env node
// generate-license.js - Generate LICENSE file with picture attributions
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

// Base license for the project code
const BASE_LICENSE = `MIT License

Copyright (c) 2025 Puzzle Lab Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

================================================================================
THIRD-PARTY IMAGE ATTRIBUTIONS
================================================================================

This application may include images that are subject to their own licenses.
The following images are used with proper attribution:

`;

function loadPictureAttribtuions() {
  const attributions = [];

  // Load local pictures
  try {
    const picturesPath = resolve(rootDir, "pictures", "pictures.json");
    const picturesData = JSON.parse(readFileSync(picturesPath, "utf-8"));

    if (picturesData.pictures) {
      picturesData.pictures.forEach((pic) => {
        if (typeof pic === "object" && pic.license) {
          attributions.push({
            title: pic.title || pic.filename,
            type: "local",
            filename: pic.filename,
            license: pic.license,
          });
        }
      });
    }
  } catch (error) {
    console.warn(
      "[generate-license] Could not load local pictures:",
      error.message
    );
  }

  // Load remote pictures
  try {
    const remotePicturesPath = resolve(
      rootDir,
      "pictures",
      "remote-pictures.json"
    );
    const remotePicturesData = JSON.parse(
      readFileSync(remotePicturesPath, "utf-8")
    );

    if (remotePicturesData.pictures) {
      remotePicturesData.pictures.forEach((pic) => {
        if (pic.license) {
          attributions.push({
            title: pic.title,
            type: "remote",
            url: pic.url,
            license: pic.license,
          });
        }
      });
    }
  } catch (error) {
    console.warn(
      "[generate-license] Could not load remote pictures:",
      error.message
    );
  }

  return attributions;
}

function generateLicenseFile() {
  const attributions = loadPictureAttribtuions();

  let licenseContent = BASE_LICENSE;

  if (attributions.length === 0) {
    licenseContent += "No images with specific license attributions found.\n";
  } else {
    // Group by license to make it more readable
    const byLicense = {};
    attributions.forEach((attr) => {
      if (!byLicense[attr.license]) {
        byLicense[attr.license] = [];
      }
      byLicense[attr.license].push(attr);
    });

    Object.entries(byLicense).forEach(([license, items]) => {
      licenseContent += `\n${license}\n`;
      licenseContent += "-".repeat(license.length) + "\n";
      items.forEach((item) => {
        licenseContent += `  - ${item.title}`;
        if (item.type === "local") {
          licenseContent += ` (${item.filename})`;
        } else if (item.type === "remote") {
          licenseContent += `\n    ${item.url}`;
        }
        licenseContent += "\n";
      });
    });
  }

  licenseContent += `
================================================================================
DEPENDENCIES
================================================================================

This project uses the following third-party libraries, each under their own
license terms. Please refer to their respective package directories in
node_modules for full license texts:

  - graphlib: Graph data structure library
  - vite: Build tool and development server
  - vitest: Unit testing framework
  - And other development dependencies listed in package.json

For production builds, only runtime dependencies are included.
`;

  const licensePath = resolve(rootDir, "LICENSE");
  writeFileSync(licensePath, licenseContent, "utf-8");
  console.log(
    `[generate-license] Generated LICENSE file with ${attributions.length} image attributions`
  );
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateLicenseFile();
}

export { generateLicenseFile };
