import { SiteHeader } from "@/components/site-header";

export default function EnterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="public" />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8 sm:py-10">{children}</main>
    </div>
  );
}
