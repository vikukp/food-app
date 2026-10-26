import manifest from "@/app/manifest";

// The counter installs as an app of its own on a stall's tablet: it opens on
// the kitchen queue and keeps to /vendor. Linked from app/vendor/layout.tsx;
// the employee app's manifest is app/manifest.ts.
export const dynamic = "force-dynamic";

export function GET() {
  const app = manifest();
  return Response.json(
    {
      ...app,
      id: "/vendor",
      name: `${app.name} Counter`,
      short_name: "Counter",
      description: `The kitchen queue for a stall at ${app.name}.`,
      start_url: "/vendor",
      scope: "/vendor",
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
