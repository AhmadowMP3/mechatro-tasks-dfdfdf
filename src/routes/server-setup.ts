import { createFileRoute } from "@tanstack/react-router";

const htmlHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export const Route = createFileRoute("/server-setup")({
  server: {
    handlers: {
      GET: async () => {
        const { isUnlocked, lockScreenHtml, SERVER_SETUP_HTML } = await import(
          "@/lib/server-setup.server"
        );
        const body = (await isUnlocked()) ? SERVER_SETUP_HTML : lockScreenHtml();
        return new Response(body, { headers: htmlHeaders });
      },
      POST: async ({ request }) => {
        const mod = await import("@/lib/server-setup.server");
        const contentType = request.headers.get("content-type") ?? "";

        // JSON API (load / save the encrypted blob) — gate required.
        if (contentType.includes("application/json")) {
          if (!(await mod.isUnlocked())) {
            return new Response(JSON.stringify({ error: "locked" }), {
              status: 401,
              headers: jsonHeaders,
            });
          }
          const body = (await request.json()) as {
            action?: string;
            ciphertext?: string;
            iv?: string;
            salt?: string;
          };

          if (body.action === "load") {
            const blob = await mod.loadVault();
            return new Response(JSON.stringify({ blob }), { headers: jsonHeaders });
          }

          if (body.action === "save") {
            if (!body.ciphertext || !body.iv || !body.salt) {
              return new Response(JSON.stringify({ error: "bad_payload" }), {
                status: 400,
                headers: jsonHeaders,
              });
            }
            await mod.saveVault({
              ciphertext: body.ciphertext,
              iv: body.iv,
              salt: body.salt,
            });
            return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
          }

          return new Response(JSON.stringify({ error: "unknown_action" }), {
            status: 400,
            headers: jsonHeaders,
          });
        }

        // Password gate form submit.
        const form = await request.formData();
        const password = String(form.get("password") ?? "");
        if (await mod.unlock(password)) {
          return new Response(mod.SERVER_SETUP_HTML, { headers: htmlHeaders });
        }
        return new Response(mod.lockScreenHtml(true), {
          status: 401,
          headers: htmlHeaders,
        });
      },
    },
  },
});
