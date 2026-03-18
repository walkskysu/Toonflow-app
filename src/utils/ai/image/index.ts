import "./type";
import u from "@/utils";
import modelList from "./modelList";
import axios from "axios";

import volcengine from "./owned/volcengine";
import kling from "./owned/kling";
import vidu from "./owned/vidu";
import runninghub from "./owned/runninghub";
import apimart from "./owned/apimart";
import other from "./owned/other";
import gemini from "./owned/gemini";
import modelScope from "./owned/modelScope";
import grsai from "./owned/grsai";
import { tr } from "zod/locales";
import formal from "./owned/formal";

const inferImageExtensionFromDataUrl = (dataUrl: string): string => {
  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/);
  const mimeSubType = match?.[1]?.toLowerCase();
  if (!mimeSubType) return "png";
  if (mimeSubType.includes("jpeg") || mimeSubType.includes("jpg")) return "jpg";
  if (mimeSubType.includes("gif")) return "gif";
  if (mimeSubType.includes("webp")) return "webp";
  return "png";
};

const inferImageExtensionFromUrl = (url: string): string => {
  const cleaned = url.split("?")[0]?.split("#")[0] || "";
  const ext = cleaned.split(".").pop()?.toLowerCase();
  if (!ext) return "png";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  return "png";
};

const saveTmpImageCopy = async (imageContent: string) => {
  try {
    let dataToWrite = imageContent;
    let ext = "png";

    if (imageContent.startsWith("http")) {
      ext = inferImageExtensionFromUrl(imageContent);
      dataToWrite = await urlToBase64(imageContent);
    } else if (imageContent.startsWith("data:image/")) {
      ext = inferImageExtensionFromDataUrl(imageContent);
    }

    if (!dataToWrite.startsWith("data:image/")) return;
    const base64Data = dataToWrite.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    const filePath = `tmp_medias/images/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await u.oss.writeFile(filePath, Buffer.from(base64Data, "base64"));
    console.info("[AI][IMAGE] tmp_copy_saved", { filePath });
  } catch (error: any) {
    console.warn("[AI][IMAGE] tmp_copy_failed", { message: error?.message || String(error) });
  }
};

const urlToBase64 = async (url: string): Promise<string> => {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  const base64 = Buffer.from(res.data).toString("base64");
  const mimeType = res.headers["content-type"] || "image/png";
  return `data:${mimeType};base64,${base64}`;
};

const modelInstance = {
  gemini: gemini,
  volcengine: volcengine,
  kling: kling,
  vidu: vidu,
  runninghub: runninghub,
  // apimart: apimart,
  modelScope,
  other,
  grsai,
  formal,
} as const;

export default async (input: ImageConfig, config: AIConfig) => {
  const { model, apiKey, baseURL, manufacturer } = { ...config };
  const startedAt = Date.now();
  const logContext = {
    model: model || "unknown",
    manufacturer: manufacturer || "unknown",
    baseURL: baseURL || "default",
  };

  if (!config || !config?.model || !config?.apiKey || !config?.manufacturer) throw new Error("请检查模型配置是否正确");

  const manufacturerFn = modelInstance[manufacturer as keyof typeof modelInstance];
  if (!manufacturerFn) if (!manufacturerFn) throw new Error("不支持的图片厂商");

  // if (manufacturer !== "other") {
  //   const owned = modelList.find((m) => m.model === model);
  //   if (!owned) throw new Error("不支持的模型");
  // }
  //添加到任务中心
  // const [taskId] = await u.db("t_myTasks").insert({
  //   taskClass: input.taskClass,
  //   relatedObjects: input.name,
  //   model: config?.model ? config.model : "未知模型",
  //   describe: input.describe ? input.describe : "无",
  //   state: "进行中",
  //   startTime: Date.now(),
  //   projectId: input.projectId,
  // });
  // 补充图片的 base64 内容类型字符串
  if (input.imageBase64 && input.imageBase64.length > 0) {
    input.imageBase64 = input.imageBase64.map((img) => {
      if (img.startsWith("data:image/")) {
        return img;
      }
      // 根据 base64 头部判断图片类型
      if (img.startsWith("/9j/")) {
        return `data:image/jpeg;base64,${img}`;
      }
      if (img.startsWith("iVBORw")) {
        return `data:image/png;base64,${img}`;
      }
      if (img.startsWith("R0lGOD")) {
        return `data:image/gif;base64,${img}`;
      }
      if (img.startsWith("UklGR")) {
        return `data:image/webp;base64,${img}`;
      }
      // 默认使用 png
      return `data:image/png;base64,${img}`;
    });
  }
  try {
    console.info("[AI][IMAGE] request_start", {
      ...logContext,
      promptLength: input.prompt?.length || 0,
      imageCount: input.imageBase64?.length || 0,
      resType: input.resType || "b64",
      hasSize: Boolean(input.size),
      aspectRatio: input.aspectRatio || null,
    });
    let imageUrl = await manufacturerFn(input, { model, apiKey, baseURL });

    if (!input.resType) input.resType = "b64";
    if (input.resType === "b64" && imageUrl.startsWith("http")) imageUrl = await urlToBase64(imageUrl);
    await saveTmpImageCopy(imageUrl);
    console.info("[AI][IMAGE] request_success", {
      ...logContext,
      costMs: Date.now() - startedAt,
      outputType: imageUrl.startsWith("data:") ? "base64" : "url",
      outputLength: imageUrl.length,
    });
    // await u.db("t_myTasks").where("id", taskId).update({
    //   state: "已完成",
    // });
    return imageUrl;
  } catch (error: any) {
    console.error("[AI][IMAGE] request_error", {
      ...logContext,
      costMs: Date.now() - startedAt,
      message: error?.message || String(error),
    });
    // await u.db("t_myTasks").where("id", taskId).update({
    //   state: "生成失败",
    //   reason: error.message,
    // });
    throw error;
  }
};
