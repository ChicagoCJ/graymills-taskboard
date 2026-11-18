import { handleResource } from "@/resource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) => handleResource(request);
export const POST = (request: Request) => handleResource(request);
export const DELETE = (request: Request) => handleResource(request);
