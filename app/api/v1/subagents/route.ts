import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export async function GET() {
  const filePath = path.join(process.cwd(), "data", "subagents.json");
  const raw = await fs.readFile(filePath, "utf8");
  return NextResponse.json(JSON.parse(raw));
}
