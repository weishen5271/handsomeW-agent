import DigitalAssetsPanel from "../components/DigitalAssetsPanel";

type AssetsViewProps = {
  apiBaseUrl: string;
  token: string;
};

export default function AssetsView({ apiBaseUrl, token }: AssetsViewProps) {
  return <DigitalAssetsPanel apiBaseUrl={apiBaseUrl} token={token} />;
}
