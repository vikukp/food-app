import { connection } from "next/server";
import { redirect } from "next/navigation";
import { CartProvider } from "@/components/cart-provider";
import { DeviceOwner } from "@/components/device-owner";
import { getEmployeeSession } from "@/lib/session";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const session = await getEmployeeSession();
  if (!session) redirect("/enter");

  return (
    <CartProvider owner={session.uid}>
      <DeviceOwner owner={session.uid} />
      {children}
    </CartProvider>
  );
}
