import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";

export const FRAME_FPS = 2;

if (!ffmpegStatic) {
  throw new Error("FFmpeg binary not found");
}

ffmpeg.setFfmpegPath(ffmpegStatic);

export function extractFrames(inputPath: string, outputPattern: string) {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions(["-vf", `fps=${FRAME_FPS}`])
      .output(outputPattern)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

export function cutVideo(
  inputPath: string,
  outputPath: string,
  start: string,
  end: string
) {
  const duration = timeToSeconds(end) - timeToSeconds(start);

  return new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(start)
      .setDuration(duration)
      .outputOptions([
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

export function frameIndexToSeconds(index: number) {
  return index / FRAME_FPS;
}

export function secondsToTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;

  return `${String(minutes).padStart(2, "0")}:${seconds
    .toFixed(1)
    .padStart(4, "0")}`;
}

function timeToSeconds(time: string) {
  const parts = time.split(":").map(Number);

  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }

  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  }

  return Number(time);
}