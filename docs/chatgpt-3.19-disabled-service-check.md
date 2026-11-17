# Version 3.19 — Disabled test service checks

Verified November 17, 2026, after the approved test-service deployment.

| Public test endpoint | HTTP | Verified response |
| --- | --- | --- |
| https://graymills-chatgpt-auth-test.vercel.app/api/auth/get-session | 503 | OAuth test service is not configured. |
| https://graymills-chatgpt-auth-test.vercel.app/.well-known/oauth-authorization-server/api/auth | 503 | OAuth discovery is not configured. |
| https://graymills-chatgpt-mcp-test.vercel.app/api/integrations/chatgpt/mcp | 503 | Connector is disabled. |
| https://graymills-chatgpt-mcp-test.vercel.app/.well-known/oauth-protected-resource/api/integrations/chatgpt/mcp | 503 | Connector is disabled. |

These independent HTTPS checks confirm that the test applications are serving
in the intended disabled state. They do not establish a working OAuth sign-in
or an active ChatGPT connection. Credential configuration and activation remain
separate steps.
