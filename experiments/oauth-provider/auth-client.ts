"use client";

import { createAuthClient } from "better-auth/react";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

// The pinned provider client preserves the complete signed OAuth query and
// follows the server-validated login/consent response. No caller returnTo URL.
export const authClient = createAuthClient({ plugins: [oauthProviderClient()] });
