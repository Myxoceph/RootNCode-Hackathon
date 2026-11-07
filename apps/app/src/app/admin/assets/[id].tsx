import { useLocalSearchParams } from "expo-router";

import { AssetWorkspace } from "@/components/admin/asset-workspace";
import { AdminOnly } from "@/components/admin/shell";

/** `/admin/assets/<id>`: an asset's whole record, to read and to edit, beside the app's page. */
export default function AssetPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <AdminOnly>
      <AssetWorkspace key={id} id={id} />
    </AdminOnly>
  );
}
