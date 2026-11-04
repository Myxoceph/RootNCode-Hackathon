import { AssetWorkspace } from "@/components/admin/asset-workspace";
import { AdminOnly } from "@/components/admin/shell";

/** `/admin/assets/new`: the asset page's template, empty, filled in beside the app's page. */
export default function NewAsset() {
  return (
    <AdminOnly>
      <AssetWorkspace id={null} />
    </AdminOnly>
  );
}
