import { createFileRoute } from "@tanstack/react-router";

const htmlHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
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
        const { unlock, lockScreenHtml, SERVER_SETUP_HTML } = await import(
          "@/lib/server-setup.server"
        );
        const form = await request.formData();
        const password = String(form.get("password") ?? "");
        if (await unlock(password)) {
          return new Response(SERVER_SETUP_HTML, { headers: htmlHeaders });
        }
        return new Response(lockScreenHtml(true), {
          status: 401,
          headers: htmlHeaders,
        });
      },
    },
  },
});
