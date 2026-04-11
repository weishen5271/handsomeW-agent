import type { DigitalAsset } from "../components/DigitalAssetsPanel";
import ResourceManagementPanel from "../components/ResourceManagementPanel";

type ResourcesViewProps = {
  apiBaseUrl: string;
  token: string;
  onPreviewModel: (asset: DigitalAsset) => void;
};

export default function ResourcesView({ apiBaseUrl, token, onPreviewModel }: ResourcesViewProps) {
  return (
    <ResourceManagementPanel
      apiBaseUrl={apiBaseUrl}
      token={token}
      onPreviewModel={(resource) => {
        onPreviewModel({
          id: `RES-${resource.objectKey.slice(-8)}`,
          name: resource.name,
          type: "模型资源",
          status: "Normal",
          location: "资源管理",
          health: 100,
          modelFile: resource.url,
          minioObjectKey: resource.objectKey,
          metadata: {},
        });
      }}
    />
  );
}
