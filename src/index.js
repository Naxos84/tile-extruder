/**
 * Utils to extrude the tiles in a tileset by 1px.
 *
 * TODO:
 *  - Allow for customizable extrusion amount
 *  - Repacking large images?
 *  - Web app
 */

const Jimp = require("jimp");
const copyPixels = require("./copy-pixels");

/**
 * Accepts an image path and returns a Promise that resolves to a Buffer containing the extruded
 * tileset image.
 * @param {integer} tileWidth - tile width in pixels
 * @param {integer} tileHeight - tile height in pixels
 * @param {string} inputPath - the path to the tileset you want to extrude
 * @param {object} [options] - optional settings
 * @param {string} [options.mime=Jimp.AUTO] - the mime type that should be used for the buffer.
 * Defaults to Jimp.AUTO which tries to use the image's original mime type, and if not available,
 * uses png. Supported mime options: "image/png", "image/jpeg", "image/bmp"
 * @param {integer} [options.margin=0] - number of pixels between tiles and the edge of the tileset
 * image
 * @param {integer} [options.spacing=0] - number of pixels between neighboring tiles
 * @param {number} [options.color=0xffffff00] - color to use for the background color, which only
 * matters if there is margin or spacing. This is passed directly to jimp which takes RGBA hex or a
 * CSS color string, e.g. '#FF0000'. This defaults to transparent white.
 * @returns {Promise<Buffer>} - A promise that resolves to an image buffer, or rejects with an
 * error.
 */
async function extrudeTilesetToBuffer(
  tileWidth,
  tileHeight,
  inputPath,
  { mime = Jimp.AUTO, margin = 0, spacing = 0, color = 0xffffff00 } = {}
) {
  const extrudedImage = await extrudeTilesetToJimp(tileWidth, tileHeight, inputPath, {
    margin,
    spacing,
    color
  });
  const buffer = await extrudedImage.getBufferAsync(mime).catch(err => {
    console.error("Buffer could not be created from tileset.");
    throw err;
  });
  return buffer;
}

/**
 * Accepts an image path and saves out an extruded version of the tileset to `outputPath`. It
 * returns a Promise that resolves when the file has finished saving.
 * @param {integer} tileWidth - tile width in pixels
 * @param {integer} tileHeight - tile height in pixels
 * @param {string} inputPath - the path to the tileset you want to extrude
 * @param {string} outputPath - the path to output the extruded tileset image
 * @param {object} [options] - optional settings
 * @param {integer} [options.margin=0] - number of pixels between tiles and the edge of the tileset
 * image
 * @param {integer} [options.spacing=0] - number of pixels between neighboring tiles
 * @param {number} [options.color=0xffffff00] - color to use for the background color, which only
 * matters if there is margin or spacing. This is passed directly to jimp which takes RGBA hex or a
 * CSS color string, e.g. '#FF0000'. This defaults to transparent white.
 * @returns {Promise} - A promise that resolves when finished saving, or rejects with an error.
 */
async function extrudeTilesetToImage(
  tileWidth,
  tileHeight,
  inputPath,
  outputPath,
  { margin = 0, spacing = 0, color = 0xffffff00 } = {}
) {
  const extrudedImage = await extrudeTilesetToJimp(tileWidth, tileHeight, inputPath, {
    margin,
    spacing,
    color
  });
  await extrudedImage.writeAsync(outputPath).catch(err => {
    console.error(`Tileset image could not be saved to: ${outputPath}`);
    throw err;
  });
}

/**
 * Accepts an image path and returns a Jimp image object containing the extruded image. This is
 * exposed for advanced image processing purposes. For more common uses, see extrudeTilesetToImage
 * or extrudeTilesetToBuffer. It returns a Promise that resolves when it is finished extruding the
 * image.
 * @param {integer} tileWidth - tile width in pixels
 * @param {integer} tileHeight - tile height in pixels
 * @param {string} inputPath - the path to the tileset you want to extrude
 * @param {object} [options] - optional settings
 * @param {integer} [options.margin=0] - number of pixels between tiles and the edge of the tileset
 * image
 * @param {integer} [options.spacing=0] - number of pixels between neighboring tiles
 * @param {number} [options.color=0xffffff00] - color to use for the background color, which only
 * matters if there is margin or spacing. This is passed directly to jimp which takes RGBA hex or a
 * CSS color string, e.g. '#FF0000'. This defaults to transparent white.
 * @returns {Promise<Image>} - A promise that resolves to a Jimp image object, or rejects with an
 * error.
 */
async function extrudeTilesetToJimp(
  tileWidth,
  tileHeight,
  inputPath,
  { margin = 0, spacing = 0, color = 0xffffff00 } = {}
) {
  const image = await Jimp.read(inputPath).catch(err => {
    console.error(`Tileset image could not be loaded from: ${inputPath}`);
    throw err;
  });

  const { width, height } = image.bitmap;

  // Solve for "cols" & "rows" to get the formula used here
  //  width = 2 * margin + (cols - 1) * spacing + cols * tileWidth
  //  height = 2 * margin + (rows - 1) * spacing + rows * tileHeight
  const cols = (width - 2 * margin + spacing) / (tileWidth + spacing);
  const rows = (height - 2 * margin + spacing) / (tileHeight + spacing);

  if (!Number.isInteger(cols) || !Number.isInteger(rows)) {
    throw new Error(
      "Non-integer number of rows or cols found. The image doesn't match the specified parameters. Double check your margin, spacing, tileWidth and tileHeight."
    );
  }

  // Same calculation but in reverse & inflating the tile size by the extrusion amount
  const newWidth = 2 * margin + (cols - 1) * spacing + cols * (tileWidth + 2);
  const newHeight = 2 * margin + (rows - 1) * spacing + rows * (tileHeight + 2);

  const extrudedImage = await new Jimp(newWidth, newHeight, color);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let srcX = margin + col * (tileWidth + spacing); // x of tile top left
      let srcY = margin + row * (tileHeight + spacing); // y of tile top left
      let destX = margin + col * (tileWidth + spacing + 2); // x of the extruded tile top left
      let destY = margin + row * (tileHeight + spacing + 2); // y of the extruded tile top left
      const tw = tileWidth;
      const th = tileHeight;

      // Copy the tile.
      copyPixels(image, srcX, srcY, tw, th, extrudedImage, destX + 1, destY + 1);

      // Extrude the top row.
      copyPixels(image, srcX, srcY, tw, 1, extrudedImage, destX + 1, destY);

      // Extrude the bottom row.
      copyPixels(image, srcX, srcY + th - 1, tw, 1, extrudedImage, destX + 1, destY + th + 1);

      // Extrude left column.
      copyPixels(image, srcX, srcY, 1, th, extrudedImage, destX, destY + 1);

      // Extrude the right column.
      copyPixels(image, srcX + tw - 1, srcY, 1, th, extrudedImage, destX + tw + 1, destY + 1);

      // Corners, order: TL, TR, BL, BR.
      copyPixels(image, srcX, srcY, 1, 1, extrudedImage, destX, destY);
      copyPixels(image, srcX + tw - 1, srcY, 1, 1, extrudedImage, destX + tw + 1, destY);
      copyPixels(image, srcX, srcY + th - 1, 1, 1, extrudedImage, destX, destY + th + 1);
      copyPixels(
        image,
        srcX + tw - 1,
        srcY + th - 1,
        1,
        1,
        extrudedImage,
        destX + tw + 1,
        destY + th + 1
      );
    }
  }

  return extrudedImage;
}

module.exports = {
  extrudeTilesetToBuffer,
  extrudeTilesetToImage,
  extrudeTilesetToJimp
};
