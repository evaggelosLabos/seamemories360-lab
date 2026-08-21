import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { CLIPS_DIR } from "@/lib/storage";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    filename: string;
  }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { filename } = await params;
  const filePath = path.join(CLIPS_DIR, filename);

  try {
    const file = await fs.readFile(filePath);

    return new NextResponse(file, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }
}