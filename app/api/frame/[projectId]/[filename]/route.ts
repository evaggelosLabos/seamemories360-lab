import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { FRAMES_DIR } from "@/lib/storage";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    projectId: string;
    filename: string;
  }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { projectId, filename } = await params;
  const filePath = path.join(FRAMES_DIR, projectId, filename);

  try {
    const file = await fs.readFile(filePath);

    return new NextResponse(file, {
      headers: {
        "Content-Type": "image/jpeg",
      },
    });
  } catch {
    return NextResponse.json({ error: "Frame not found" }, { status: 404 });
  }
}