import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Box, RotateCcw } from "lucide-react";
import { Canvas, useLoader } from "@react-three/fiber";
import { Html, OrbitControls, useProgress } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { Box3, Vector3, type Group, type Object3D } from "three";
import type { DigitalAsset } from "./DigitalAssetsPanel";

type Scene3DPanelProps = {
  apiBaseUrl: string;
  token: string;
  asset: DigitalAsset | null;
  onBackToAssets: () => void;
};

type ModelTransformProps = {
  url: string;
  zoom: number;
  tiltX: number;
  rotateY: number;
};

type FitResult = {
  object: Object3D;
  fitScale: number;
  center: Vector3;
};

type ModelErrorBoundaryProps = {
  onError: (message: string) => void;
  children: ReactNode;
};

class ModelErrorBoundary extends Component<ModelErrorBoundaryProps> {
  componentDidCatch(error: Error) {
    this.props.onError(error.message || "模型加载失败");
  }

  render() {
    return this.props.children;
  }
}

function LoadingOverlay() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-2 text-xs font-semibold text-[var(--color-text)] shadow">
        模型加载中 {Math.round(progress)}%
      </div>
    </Html>
  );
}

function fitObject(object: Object3D): FitResult {
  const clone = object.clone(true);
  const box = new Box3().setFromObject(clone);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fitScale = maxDim > 0 ? 2 / maxDim : 1;
  return { object: clone, fitScale, center };
}

function GltfModel({ url, zoom, tiltX, rotateY }: ModelTransformProps) {
  const gltf = useLoader(GLTFLoader, url);
  const { object, fitScale, center } = useMemo(() => fitObject(gltf.scene), [gltf.scene]);
  return (
    <group
      scale={zoom * fitScale}
      rotation={[((tiltX * Math.PI) / 180) as number, ((rotateY * Math.PI) / 180) as number, 0]}
      position={[-center.x * fitScale, -center.y * fitScale, -center.z * fitScale]}
    >
      <primitive object={object as Group} />
    </group>
  );
}

function ObjModel({ url, zoom, tiltX, rotateY }: ModelTransformProps) {
  const object = useLoader(OBJLoader, url);
  const fit = useMemo(() => fitObject(object), [object]);
  return (
    <group
      scale={zoom * fit.fitScale}
      rotation={[((tiltX * Math.PI) / 180) as number, ((rotateY * Math.PI) / 180) as number, 0]}
      position={[-fit.center.x * fit.fitScale, -fit.center.y * fit.fitScale, -fit.center.z * fit.fitScale]}
    >
      <primitive object={fit.object as Object3D} />
    </group>
  );
}

function FbxModel({ url, zoom, tiltX, rotateY }: ModelTransformProps) {
  const object = useLoader(FBXLoader, url);
  const fit = useMemo(() => fitObject(object), [object]);
  return (
    <group
      scale={zoom * fit.fitScale}
      rotation={[((tiltX * Math.PI) / 180) as number, ((rotateY * Math.PI) / 180) as number, 0]}
      position={[-fit.center.x * fit.fitScale, -fit.center.y * fit.fitScale, -fit.center.z * fit.fitScale]}
    >
      <primitive object={fit.object as Object3D} />
    </group>
  );
}

function ModelSwitch({ url, zoom, tiltX, rotateY }: ModelTransformProps) {
  const ext = useMemo(() => url.split("?")[0].split(".").pop()?.toLowerCase() ?? "", [url]);
  if (ext === "glb" || ext === "gltf") {
    return <GltfModel url={url} zoom={zoom} tiltX={tiltX} rotateY={rotateY} />;
  }
  if (ext === "obj") {
    return <ObjModel url={url} zoom={zoom} tiltX={tiltX} rotateY={rotateY} />;
  }
  if (ext === "fbx") {
    return <FbxModel url={url} zoom={zoom} tiltX={tiltX} rotateY={rotateY} />;
  }
  throw new Error("暂不支持当前模型格式，请上传 glb/gltf/obj/fbx 文件");
}

export default function Scene3DPanel({ apiBaseUrl: _apiBaseUrl, token: _token, asset, onBackToAssets }: Scene3DPanelProps) {
  const [zoom, setZoom] = useState(1);
  const [rotateY, setRotateY] = useState(0);
  const [tiltX, setTiltX] = useState(0);
  const [loadError, setLoadError] = useState("");

  if (!asset) {
    return (
      <section className="flex h-full items-center justify-center bg-[var(--color-surface-raised)]/30 p-6">
        <div className="card max-w-lg p-6 text-center">
          <h3 className="text-xl font-bold text-[var(--color-text)]">模型漫游</h3>
          <p className="mt-2 text-[var(--color-text-weak)]">请先进入资产详情页，再开启当前数字资产的模型漫游。</p>
          <button
            type="button"
            onClick={onBackToAssets}
            className="btn-primary mt-5 inline-flex items-center gap-2"
          >
            返回数字资产
          </button>
        </div>
      </section>
    );
  }

  const modelUrl = asset.modelFile?.trim();
  const modelName = modelUrl ? modelUrl.split("?")[0].split("/").pop() ?? modelUrl : "未配置模型";

  useEffect(() => {
    setLoadError("");
  }, [modelUrl]);

  return (
    <section className="h-full overflow-y-auto bg-[var(--color-surface-raised)]/30 p-6 md:p-8">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="space-y-1 text-sm text-[var(--color-text-weak)]">
          <p>
            当前资产：<span className="font-semibold text-[var(--color-text)]">{asset.name}</span>
          </p>
          <p>
            模型文件：<span className="font-mono text-[var(--color-text)]">{modelName}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onBackToAssets}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-[var(--color-text)] transition hover:bg-[var(--color-surface-raised)]"
        >
          <RotateCcw size={16} /> 返回资产库
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 shadow-sm">
          <div className="relative h-[440px] overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
            {!modelUrl ? (
              <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-weak)]">当前资产未配置模型地址</div>
            ) : (
              <Canvas camera={{ position: [0, 1.8, 5.6], fov: 45 }}>
                <color attach="background" args={["#020617"]} />
                <ambientLight intensity={0.6} />
                <hemisphereLight intensity={0.5} groundColor="#334155" />
                <directionalLight position={[5, 8, 4]} intensity={1} />
                <ModelErrorBoundary
                  onError={(message) => {
                    setLoadError(message);
                  }}
                >
                  <Suspense fallback={<LoadingOverlay />}>
                    <ModelSwitch
                      url={modelUrl}
                      zoom={zoom}
                      tiltX={tiltX}
                      rotateY={rotateY}
                    />
                  </Suspense>
                </ModelErrorBoundary>
                <gridHelper args={[12, 12, "#334155", "#1e293b"]} position={[0, -1.3, 0]} />
                <OrbitControls
                  enablePan
                  enableZoom
                  onChange={() => {
                    if (loadError) setLoadError("");
                  }}
                />
              </Canvas>
            )}
          </div>
          {loadError ? (
            <p className="mt-3 text-xs text-red-300">{loadError}</p>
          ) : (
            <p className="mt-3 text-xs text-[var(--color-text-weak)]">支持鼠标拖拽旋转、滚轮缩放，也可通过右侧滑条微调姿态。</p>
          )}
        </div>

        <aside className="card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-[var(--color-text)]">
            <Box size={18} className="text-blue-600" /> 模型信息
          </h3>

          <div className="space-y-4 text-sm">
            <dl className="space-y-2">
              <div>
                <dt className="text-[var(--color-text-weak)]">模型名称</dt>
                <dd className="font-semibold text-[var(--color-text)]">{modelName}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-weak)]">模型来源</dt>
                <dd className="break-all font-mono text-xs text-[var(--color-text)]">{modelUrl || "--"}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-weak)]">对象键</dt>
                <dd className="break-all font-mono text-xs text-[var(--color-text)]">{asset.minioObjectKey || "--"}</dd>
              </div>
            </dl>

            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-xs text-[var(--color-text-weak)]">缩放</span>
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-[var(--color-text-weak)]">左右旋转</span>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={rotateY}
                  onChange={(e) => setRotateY(Number(e.target.value))}
                  className="w-full"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-[var(--color-text-weak)]">俯仰角</span>
                <input
                  type="range"
                  min={-75}
                  max={75}
                  step={1}
                  value={tiltX}
                  onChange={(e) => setTiltX(Number(e.target.value))}
                  className="w-full"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setRotateY(0);
                setTiltX(0);
                setLoadError("");
              }}
              className="btn-secondary w-full"
            >
              重置视角
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
