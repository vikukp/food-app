import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        That stall or order is not on Campus Food Court.
      </p>
      <Button className="mt-4" render={<Link href="/stalls" />}>
        Back to stalls
      </Button>
    </div>
  );
}
