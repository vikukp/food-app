import Link from "next/link";
import { LogOutIcon } from "lucide-react";
import { logoutVendor } from "@/lib/actions";
import { brandAssetUrl, brandLogo, brandNames, logoFile } from "@/lib/brand";
import { buttonVariants } from "@/components/ui/button";

type Props = {
  variant: "public" | "employee" | "vendor";
  name?: string;
  stallName?: string;
  // The section this page belongs to, marked in the header.
  current?: "stalls" | "orders" | "queue" | "menu";
  right?: React.ReactNode;
};

function NavLink({ href, current, children }: { href: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={buttonVariants({
        variant: "ghost",
        size: "sm",
        className:
          "px-2 text-emerald-50 hover:bg-white/10 hover:text-white aria-[current=page]:bg-white/15 aria-[current=page]:text-white",
      })}
    >
      {children}
    </Link>
  );
}

const signOutClass = buttonVariants({
  variant: "ghost",
  size: "sm",
  className: "text-emerald-50 ring-1 ring-white/30 hover:bg-white/10 hover:text-white",
});

// An icon on phones, so the header's links still fit on one line.
function SignOutLabel() {
  return (
    <>
      <LogOutIcon aria-hidden className="sm:hidden" />
      <span className="sr-only sm:not-sr-only">Sign out</span>
    </>
  );
}

export function SiteHeader({ variant, name, stallName, current, right }: Props) {
  const brand = brandNames();
  const logo = brandLogo();
  return (
    <header className="sticky top-0 z-40 border-b border-emerald-900/10 bg-[#0b3d32] text-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4 sm:gap-3">
        <Link
          href={variant === "vendor" ? "/vendor" : variant === "employee" ? "/stalls" : "/"}
          className="flex min-w-0 items-center gap-2"
        >
          {/* An SVG logo as it is; a PNG one at a size made for this, not the whole upload. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brandAssetUrl(logo, logo.type === "image/svg+xml" ? logoFile(logo) : "icon-192.png")}
            alt=""
            width={28}
            height={28}
            className="size-7 shrink-0 object-contain"
          />
          {/* Beside the employee links, the smallest phones only have room for the logo. */}
          <div className={variant === "employee" ? "min-w-0 max-[359px]:sr-only" : "min-w-0"}>
            {brand.headerTop ? (
              <p className="truncate text-[11px] font-medium tracking-[0.1em] text-emerald-100/80 uppercase sm:tracking-[0.18em]">
                {brand.headerTop}
              </p>
            ) : null}
            <p className="truncate text-sm font-semibold tracking-tight">{brand.headerMain}</p>
          </div>
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          {variant === "employee" && name ? (
            <>
              <span className="hidden max-w-[140px] truncate text-xs text-emerald-50/90 sm:inline">
                {name}
              </span>
              <NavLink href="/stalls" current={current === "stalls"}>
                Stalls
              </NavLink>
              <NavLink href="/orders" current={current === "orders"}>
                Orders
              </NavLink>
              {right}
              <form action="/api/logout" method="post">
                <button type="submit" className={signOutClass}>
                  <SignOutLabel />
                </button>
              </form>
            </>
          ) : null}
          {variant === "vendor" && stallName ? (
            <>
              <span className="hidden max-w-[160px] truncate text-xs text-emerald-50/90 sm:inline">
                {stallName}
              </span>
              <NavLink href="/vendor" current={current === "queue"}>
                Queue
              </NavLink>
              <NavLink href="/vendor/menu" current={current === "menu"}>
                Menu
              </NavLink>
              <form action={logoutVendor}>
                <button type="submit" className={signOutClass}>
                  <SignOutLabel />
                </button>
              </form>
            </>
          ) : null}
          {variant === "public" ? right : null}
        </div>
      </div>
    </header>
  );
}
