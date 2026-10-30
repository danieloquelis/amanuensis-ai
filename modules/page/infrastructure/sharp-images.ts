import sharp from "sharp";
import type { PageImages, PageLabel } from "../application/read-page";

const LABEL_COLOR = "#d01010";
/** The labels' white outline, as a share of their height: readable over staff lines and stems. */
const OUTLINE = 1 / 8;
const JPEG_QUALITY = 85;

const escapeXml = (text: string) => text.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

async function enlarged(bytes: Uint8Array, scale: number) {
  const image = sharp(bytes).flatten({ background: "#ffffff" });
  if (scale === 1) return image;
  const { width } = await sharp(bytes).metadata();
  return image.resize({ width: Math.round(width! * scale), kernel: "lanczos3" });
}

/** Pictures decoded, enlarged and labelled with sharp (libvips), on the server. */
export function createPageImages(): PageImages {
  return {
    async gray(bytes, scale) {
      const image = await enlarged(bytes, scale);
      const { data, info } = await image.grayscale().raw().toBuffer({ resolveWithObject: true });
      return {
        data: new Uint8Array(data.buffer, data.byteOffset, data.length),
        width: info.width,
        height: info.height,
      };
    },

    async labelled(bytes, scale, labels: PageLabel[], size, side) {
      const page = await (await enlarged(bytes, scale)).png().toBuffer();
      const { width, height } = await sharp(page).metadata();
      const texts = labels.map(
        ({ x, y, text }) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}">${escapeXml(text)}</text>`,
      );
      const style = `font-family="Arial" font-size="${size.toFixed(1)}" font-weight="bold" fill="${LABEL_COLOR}" stroke="#ffffff" stroke-width="${(size * OUTLINE).toFixed(1)}" paint-order="stroke"`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g ${style}>${texts.join("")}</g></svg>`;
      const drawn = await sharp(page)
        .composite([{ input: Buffer.from(svg) }])
        .png()
        .toBuffer();
      const jpeg = await sharp(drawn)
        .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();
      return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    },
  };
}
