import type { Photo } from "./types";
import { uid } from "./domain";

const MAX_EDGE = 900;
const QUALITY = 0.72;

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

function shrink(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      if (width <= MAX_EDGE && height <= MAX_EDGE && dataUrl.startsWith("data:image/jpeg")) {
        resolve(dataUrl);
        return;
      }
      const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", QUALITY));
    };
    img.onerror = () => resolve(dataUrl); // 压缩失败就保留原图
    img.src = dataUrl;
  });
}

export async function fileToPhoto(file: File, note?: string): Promise<Photo> {
  const dataUrl = await readFile(file);
  const shrunk = await shrink(dataUrl);
  return {
    id: uid("p"),
    name: file.name || "蹄部照片",
    dataUrl: shrunk,
    note: note?.trim() || "",
    createdAt: new Date().toISOString(),
  };
}
