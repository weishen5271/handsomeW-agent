import type { DigitalAsset } from "../components/DigitalAssetsPanel";
import Scene3DPanel from "../components/Scene3DPanel";

type Scene3DViewProps = {
  apiBaseUrl: string;
  token: string;
  asset: DigitalAsset | null;
  onBackToAssets: () => void;
};

export default function Scene3DView({ apiBaseUrl, token, asset, onBackToAssets }: Scene3DViewProps) {
  return <Scene3DPanel apiBaseUrl={apiBaseUrl} token={token} asset={asset} onBackToAssets={onBackToAssets} />;
}
