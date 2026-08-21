import { NextResponse } from "next/server";
import path from "path";
import { CLIPS_DIR, UPLOADS_DIR, ensureStorageDirs } from "@/lib/storage";
import { cutVideo } from "@/lib/ffmpeg";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await ensureStorageDirs();

    const body = await req.json();
    const { projectId, start, end } = body;

    if (!projectId || !start || !end) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const safeStart = String(start).replaceAll(":", "-");
    const safeEnd = String(end).replaceAll(":", "-");

    const inputPath = path.join(UPLOADS_DIR, `${projectId}.mp4`);
    const outputFilename = `${projectId}_${safeStart}_${safeEnd}.mp4`;
    const outputPath = path.join(CLIPS_DIR, outputFilename);

    await cutVideo(inputPath, outputPath, start, end);

    return NextResponse.json({
      clipUrl: `/api/download/${outputFilename}`,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Cut failed" }, { status: 500 });
  }
}