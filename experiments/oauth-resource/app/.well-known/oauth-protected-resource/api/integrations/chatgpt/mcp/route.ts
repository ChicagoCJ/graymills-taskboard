import { handleMetadata } from "@/resource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) => handleMetadata(request);
