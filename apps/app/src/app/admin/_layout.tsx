import { Slot } from "expo-router";

import { AdminShell } from "@/components/admin/shell";

/** The admin panel (`/admin`): its own frame, with a side bar instead of the app's tab bar. */
export default function AdminLayout() {
  return (
    <AdminShell>
      <Slot />
    </AdminShell>
  );
}
