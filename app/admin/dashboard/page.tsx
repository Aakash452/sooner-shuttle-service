import { redirect } from "next/navigation";
import { isAdminRequest } from "@/lib/adminGuard";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  if (!(await isAdminRequest())) {
    redirect("/admin");
  }
  return <DashboardClient />;
}
