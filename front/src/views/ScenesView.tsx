import SceneConfigPanel from "../components/SceneConfigPanel";

type ScenesViewProps = {
  apiBaseUrl: string;
  token: string;
};

export default function ScenesView({ apiBaseUrl, token }: ScenesViewProps) {
  return <SceneConfigPanel apiBaseUrl={apiBaseUrl} token={token} />;
}
