import "./type";
import u from "@/utils";
import modelList from "./modelList";
import axios from "axios";

import volcengine from "./owned/volcengine";
import kling from "./owned/kling";
import vidu from "./owned/vidu";
import wan from "./owned/wan";
import runninghub from "./owned/runninghub";
import gemini from "./owned/gemini";
import apimart from "./owned/apimart";
import other from "./owned/other";
import grsai from "./owned/grsai";
import formal from "./owned/formal";

const inferVideoExtensionFromUrl = (url: string): string => {
  const cleaned = url.split("?")[0]?.split("#")[0] || "";
  const ext = cleaned.split(".").pop()?.toLowerCase();
  if (ext && ["mp4", "mov", "webm", "mkv", "avi", "m4v"].includes(ext)) return ext;
  return "mp4";
};

const saveTmpVideoCopyByBuffer = async (buffer: Buffer, ext = "mp4") => {
  try {
    const filePath = `tmp_medias/videos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await u.oss.writeFile(filePath, buffer);
    console.info("[AI][VIDEO] tmp_copy_saved", { filePath });
  } catch (error: any) {
    console.warn("[AI][VIDEO] tmp_copy_failed", { message: error?.message || String(error) });
  }
};

const saveTmpVideoCopyByUrl = async (videoUrl: string) => {
  try {
    const ext = inferVideoExtensionFromUrl(videoUrl);
    const response = await axios.get(videoUrl, { responseType: "arraybuffer" });
    await saveTmpVideoCopyByBuffer(Buffer.from(response.data), ext);
  } catch (error: any) {
    console.warn("[AI][VIDEO] tmp_copy_failed", { message: error?.message || String(error) });
  }
};

const modelInstance = {
  volcengine: volcengine,
  kling: kling,
  vidu: vidu,
  wan: wan,
  gemini: gemini,
  runninghub: runninghub,
  apimart: apimart,
  other: other,
  grsai: grsai,
  formal: formal,
} as const;

export default async (input: VideoConfig, config?: AIConfig) => {
  const { model, apiKey, baseURL, manufacturer } = { ...config };
  const startedAt = Date.now();
  const logContext = {
    model: model || "unknown",
    manufacturer: manufacturer || "unknown",
    baseURL: baseURL || "default",
  };
  if (!config || !config?.model || !config?.apiKey) throw new Error("请检查模型配置是否正确");

  const manufacturerFn = modelInstance[manufacturer as keyof typeof modelInstance];
  if (!manufacturerFn) if (!manufacturerFn) throw new Error("不支持的视频厂商");
  // const owned = modelList.find((m) => m.model === model);
  // if (!owned) throw new Error("不支持的模型");
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
    console.info("[AI][VIDEO] request_start", {
      ...logContext,
      promptLength: input.prompt?.length || 0,
      prompt: input.prompt || "",
      imageCount: input.imageBase64?.length || 0,
      duration: input.duration || null,
      aspectRatio: input.aspectRatio || null,
      hasAudio: Boolean(input.audio),
    });
    let videoUrl = await manufacturerFn(input, { model, apiKey, baseURL });
    if (videoUrl) {
      try {
        const response = await axios.get(videoUrl, { responseType: "stream" });
        await u.oss.writeFile(input.savePath, response.data);
        try {
          if (await u.oss.fileExists(input.savePath)) {
            const buffer = await u.oss.getFile(input.savePath);
            await saveTmpVideoCopyByBuffer(buffer, "mp4");
          } else {
            await saveTmpVideoCopyByUrl(videoUrl);
          }
        } catch (tmpError: any) {
          console.warn("[AI][VIDEO] tmp_copy_failed", { message: tmpError?.message || String(tmpError) });
        }
        console.info("[AI][VIDEO] request_success", {
          ...logContext,
          costMs: Date.now() - startedAt,
          savePath: input.savePath,
          resultType: "local_file",
        });
        // await u.db("t_myTasks").where("id", taskId).update({
        //   state: "已完成",
        // });
        return input.savePath;
      } catch (err: any) {
        await saveTmpVideoCopyByUrl(videoUrl);
        console.warn("[AI][VIDEO] request_success_but_save_failed", {
          ...logContext,
          costMs: Date.now() - startedAt,
          message: err?.message || String(err),
          fallback: "remote_url",
        });
        // await u.db("t_myTasks").where("id", taskId).update({
        //   state: "生成失败",
        //   reason: err.message,
        // });
        return videoUrl;
      }
    }
    console.info("[AI][VIDEO] request_success", {
      ...logContext,
      costMs: Date.now() - startedAt,
      resultType: "empty",
    });
    return videoUrl;
  } catch (error: any) {
    console.error("[AI][VIDEO] request_error", {
      ...logContext,
      costMs: Date.now() - startedAt,
      message: error?.message || String(error),
    });
    throw error;
  }
};
