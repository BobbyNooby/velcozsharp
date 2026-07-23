"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useOrg, useApiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Loader2, Check, ChevronRight, ChevronLeft, Building2, Briefcase, Server, ScanLine } from "lucide-react";

const steps = [
  { id: "welcome", label: "Welcome" },
  { id: "org", label: "Organization" },
  { id: "dept", label: "Department" },
  { id: "asset", label: "Asset" },
  { id: "scan", label: "Scan" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { setOrgId } = useOrg();
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);

  const [step, setStep] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [orgName, setOrgName] = useState("");
  const [deptName, setDeptName] = useState("");
  const [assetTypes, setAssetTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedAssetTypeId, setSelectedAssetTypeId] = useState("");
  const [assetName, setAssetName] = useState("");
  const [scanResult, setScanResult] = useState<{ jobId?: string; totalAssets?: number; vulnerabilitiesFound?: number } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const updateProfile = async () => {
    if (!displayName.trim()) return;
    const res = await apiFetch("/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName: displayName.trim() }),
    });
    if (res.ok) await refreshUser();
  };

  const createOrganization = async () => {
    const res = await apiFetch("/organizations", {
      method: "POST",
      body: JSON.stringify({
        name: orgName.trim(),
        description: "",
        nvdApiKey: null,
        isAiEnabled: false,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Failed to create organization");
    }
    const org = await res.json();
    return org;
  };

  const createDepartment = async () => {
    if (!deptName.trim()) return null;
    const res = await apiFetch("/departments", {
      method: "POST",
      body: JSON.stringify({ name: deptName.trim() }),
    });
    if (!res.ok) return null;
    return await res.json();
  };

  const fetchAssetTypes = async () => {
    const res = await apiFetch("/asset-types?pageSize=100");
    if (!res.ok) return;
    const data = await res.json();
    const items = data.items || [];
    setAssetTypes(items);
    if (items.length > 0) setSelectedAssetTypeId(items[0].id);
  };

  const createAsset = async () => {
    const type = assetTypes.find((t) => t.id === selectedAssetTypeId);
    const properties: Record<string, any> = {};
    if (type?.name?.toLowerCase().includes("server")) {
      properties.hostname = assetName.toLowerCase().replace(/\s+/g, "-");
      properties.os = "Ubuntu 22.04";
      properties.version = "1.0.0";
    }

    const res = await apiFetch("/assets", {
      method: "POST",
      body: JSON.stringify({
        name: assetName.trim(),
        assetTypeId: selectedAssetTypeId,
        departmentId: null,
        properties,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Failed to create asset");
    }
    return await res.json();
  };

  const runScan = async () => {
    const res = await apiFetch("/scan/assets/all", { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Failed to start scan");
    }
    return await res.json();
  };

  const handleNext = () => {
    setError("");
    startTransition(async () => {
      try {
        if (step === 0) {
          await updateProfile();
        } else if (step === 1) {
          if (!orgName.trim()) {
            setError("Organization name is required");
            return;
          }
          const org = await createOrganization();
          await refreshUser();
          setOrgId(org.id);
        } else if (step === 2) {
          await createDepartment();
          await fetchAssetTypes();
        } else if (step === 3) {
          if (!assetName.trim() || !selectedAssetTypeId) {
            setError("Asset name and type are required");
            return;
          }
          await createAsset();
        } else if (step === 4) {
          const result = await runScan();
          setScanResult(result);
          setStep((s) => s + 1);
          return;
        }
        setStep((s) => s + 1);
      } catch (err: any) {
        setError(err.message || "Something went wrong");
      }
    });
  };

  const handleFinish = () => {
    router.replace("/");
  };

  const canProceed = () => {
    if (step === 1) return orgName.trim().length > 0;
    if (step === 3) return assetName.trim().length > 0 && selectedAssetTypeId;
    return true;
  };

  return (
    <div className="flex min-h-[calc(100svh-3.5rem)] flex-col items-center justify-center p-4 md:p-6">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex items-center justify-between">
          {steps.map((s, idx) => (
            <div key={s.id} className="flex flex-1 items-center">
              <div
                className={`flex size-8 items-center justify-center rounded-full text-sm font-medium ${
                  idx <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {idx < step ? <Check className="size-4" /> : idx + 1}
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`mx-2 h-0.5 flex-1 ${
                    idx < step ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {step === 0 && "Welcome to VelcozSharp"}
              {step === 1 && "Create your organization"}
              {step === 2 && "Add a department"}
              {step === 3 && "Add your first asset"}
              {step === 4 && "Run your first scan"}
              {step === 5 && "You're all set"}
            </CardTitle>
            <CardDescription>
              {step === 0 && "Let's set up your profile."}
              {step === 1 && "Organizations separate your assets and scans."}
              {step === 2 && "Departments help organize assets (optional)."}
              {step === 3 && "Assets are what VelcozSharp scans for CVEs."}
              {step === 4 && "Scan your asset to find vulnerabilities."}
              {step === 5 && "Your first scan is running. You can explore the dashboard now."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {step === 0 && (
              <div className="space-y-2">
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jane Doe"
                  disabled={isPending}
                />
              </div>
            )}

            {step === 1 && (
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization name</Label>
                <Input
                  id="orgName"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Acme Corp"
                  disabled={isPending}
                />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-2">
                <Label htmlFor="deptName">Department name</Label>
                <Input
                  id="deptName"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="Engineering (optional)"
                  disabled={isPending}
                />
              </div>
            )}

            {step === 3 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="assetName">Asset name</Label>
                  <Input
                    id="assetName"
                    value={assetName}
                    onChange={(e) => setAssetName(e.target.value)}
                    placeholder="web-server-01"
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Asset type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {assetTypes.map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setSelectedAssetTypeId(type.id)}
                        disabled={isPending}
                        className={`rounded-md border p-3 text-left text-sm transition-colors ${
                          selectedAssetTypeId === type.id
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted"
                        }`}
                      >
                        {type.name}
                      </button>
                    ))}
                    {assetTypes.length === 0 && (
                      <div className="col-span-2 text-sm text-muted-foreground">Loading asset types...</div>
                    )}
                  </div>
                </div>
              </>
            )}

            {step === 4 && (
              <div className="rounded-md border p-4 text-sm text-muted-foreground">
                VelcozSharp will scan your asset against the NVD database and optionally use AI to score relevance.
              </div>
            )}

            {step === 5 && scanResult && (
              <div className="space-y-2 rounded-md border p-4">
                <div className="flex items-center gap-2 text-green-600">
                  <Check className="size-5" />
                  <span className="font-medium">Scan started</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Job ID: {scanResult.jobId?.slice(0, 8)}...
                </p>
                <p className="text-sm text-muted-foreground">
                  Scanning {scanResult.totalAssets} asset(s). Results will appear on the dashboard.
                </p>
              </div>
            )}

            <Separator />

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={isPending || step === 0 || step === 5}
              >
                <ChevronLeft className="mr-2 size-4" />
                Back
              </Button>
              {step < 5 ? (
                <Button onClick={handleNext} disabled={isPending || !canProceed()}>
                  {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {step === 4 ? "Run scan" : "Next"}
                  {step !== 4 && <ChevronRight className="ml-2 size-4" />}
                </Button>
              ) : (
                <Button onClick={handleFinish}>Go to dashboard</Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
