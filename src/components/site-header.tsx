import Link from "next/link";
import { logoutVendor } from "@/lib/actions";
import { buttonVariants } from "@/components/ui/button";

type Props = {
  variant: "public" | "employee" | "vendor";
  name?: string;
  stallName?: string;
  right?: React.ReactNode;
};

export function SiteHeader({ variant, name, stallName, right }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-emerald-900/10 bg-[#0b3d32] text-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <Link href={variant === "vendor" ? "/vendor" : variant === "employee" ? "/stalls" : "/"} className="min-w-0">
          <p className="text-[11px] font-medium tracking-[0.18em] text-emerald-100/80 uppercase">
            HPE IWF Campus
          </p>
          <p className="truncate text-sm font-semibold tracking-tight">Food Court</p>
        </Link>
        <div className="flex items-center gap-2">
          {variant === "employee" && name ? (
            <>
              <span className="hidden max-w-[140px] truncate text-xs text-emerald-50/90 sm:inline">
                {name}
              </span>
              <Link
                href="/orders"
                className={buttonVariants({
                  variant: "ghost",
                  size: "sm",
                  className: "text-emerald-50 hover:bg-white/10 hover:text-white",
                })}
              >
                Orders
              </Link>
              {right}
              <form action="/api/logout" method="post">
                <button
                  type="submit"
                  className={buttonVariants({
                    variant: "ghost",
                    size: "sm",
                    className: "text-emerald-50 ring-1 ring-white/30 hover:bg-white/10 hover:text-white",
                  })}
                >
                  Sign out
                </button>
              </form>
            </>
          ) : null}
          {variant === "vendor" && stallName ? (
            <>
              <span className="hidden max-w-[160px] truncate text-xs text-emerald-50/90 sm:inline">
                {stallName}
              </span>
              <Link
                href="/vendor"
                className={buttonVariants({
                  variant: "ghost",
                  size: "sm",
                  className: "text-emerald-50 hover:bg-white/10 hover:text-white",
                })}
              >
                Queue
              </Link>
              <Link
                href="/vendor/menu"
                className={buttonVariants({
                  variant: "ghost",
                  size: "sm",
                  className: "text-emerald-50 hover:bg-white/10 hover:text-white",
                })}
              >
                Menu
              </Link>
              <form action={logoutVendor}>
                <button
                  type="submit"
                  className={buttonVariants({
                    variant: "ghost",
                    size: "sm",
                    className: "text-emerald-50 ring-1 ring-white/30 hover:bg-white/10 hover:text-white",
                  })}
                >
                  Sign out
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
