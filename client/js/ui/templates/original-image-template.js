import { t } from "../../i18n.js";

export function originalImageTemplate(imageSrc) {
  return `
    <div class="original-image-container">
      <img src="${imageSrc}" alt="${t(
        "alt.originalImage",
      )}" style="max-width:100%;max-height:100%;object-fit:contain;" />
    </div>
  `;
}
