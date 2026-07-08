"use client";

import { useState, useCallback, useRef } from "react";
import { useOrg, useApiFetch } from "@/lib/api";

const API = "http://localhost:5038/api";

const DEV_ACCOUNTS = [
  { email: "admin@test.com", password: "password123", role: "Admin", name: "Admin User" },
  { email: "analyst@test.com", password: "password123", role: "SecurityAnalyst", name: "Analyst User" },
  { email: "viewer@test.com", password: "password123", role: "Viewer", name: "Viewer User" },
];

type User = {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  organizations: Array<{
    organizationId: string;
    organizationName: string;
    role: string;
    isDefault: boolean;
  }>;
};

type FieldDraft = {
  name: string;
  dataType: string;
  isRequired: boolean;
  isCveSearchable: boolean;
};

export default function AuthTestClient({
  initialUser,
  initialDepts,
  initialAssetTypes,
  initialOrgId,
}: {
  initialUser: User | null;
  initialDepts: any[];
  initialAssetTypes: any[];
  initialOrgId: string;
}) {
  const { orgId: currentOrgId, setOrgId } = useOrg();
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);

  const [user, setUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rawCookies, setRawCookies] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [depts, setDepts] = useState<any[]>(initialDepts);
  const [newDeptName, setNewDeptName] = useState("");

  const [assetTypes, setAssetTypes] = useState<any[]>(initialAssetTypes);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeDesc, setNewTypeDesc] = useState("");
  const [typeFields, setTypeFields] = useState<FieldDraft[]>([
    { name: "hostname", dataType: "text", isRequired: true, isCveSearchable: false },
    { name: "os", dataType: "text", isRequired: true, isCveSearchable: true },
    { name: "version", dataType: "text", isRequired: false, isCveSearchable: true },
  ]);

  const [assets, setAssets] = useState<any[]>([]);
  const [scanningAsset, setScanningAsset] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<Record<string, any>>({});
  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetTypeId, setNewAssetTypeId] = useState<string>(initialAssetTypes[0]?.id ?? "");
  const [newAssetDeptId, setNewAssetDeptId] = useState<string>(initialDepts[0]?.id ?? "");

  const [apiLog, setApiLog] = useState<string[]>([]);

  const log = useCallback((msg: string) => {
    if (mountedRef.current) setApiLog((prev) => [...prev.slice(-19), msg]);
  }, []);

  const fetchMe = async () => {
    try {
      const res = await fetch(`${API}/auth/me`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        if (!currentOrgId && data.organizations?.length > 0) {
          const defaultOrg = data.organizations.find((o: any) => o.isDefault);
          if (defaultOrg) setOrgId(defaultOrg.organizationId);
        }
        setError("");
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
    setRawCookies(document.cookie);
  };

  const login = async (loginEmail: string, loginPassword: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Login failed");
        setLoading(false);
        return;
      }

      await fetchMe();
      // Refresh tenant data after login
      if (currentOrgId) {
        await Promise.all([fetchDepts(), fetchAssetTypes()]);
      }
    } catch {
      setError("Network error - is backend running on :5038?");
    }
    setLoading(false);
  };

  const logout = async () => {
    setLoading(true);
    try {
      await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {}
    setUser(null);
    setOrgId("");
    setDepts([]);
    setAssetTypes([]);
    setAssets([]);
    setRawCookies(document.cookie);
    setLoading(false);
  };

  const fillAndLogin = (acc: typeof DEV_ACCOUNTS[0]) => {
    setEmail(acc.email);
    setPassword(acc.password);
    login(acc.email, acc.password);
  };

  const switchOrg = async (newOrgId: string) => {
    setOrgId(newOrgId);
    await Promise.all([
      fetchForOrg("/departments", newOrgId, setDepts),
      fetchForOrg("/asset-types", newOrgId, setAssetTypes),
      fetchForOrg("/assets", newOrgId, setAssets),
    ]);
  };

  const fetchForOrg = async (path: string, orgId: string, setter: (data: any) => void) => {
    try {
      const res = await fetch(`${API}${path}`, {
        headers: { "X-Organization-Id": orgId },
        credentials: "include",
      });
      const data = await res.json();
      setter(data);
      log(`GET ${path} -> ${res.status}, ${data.length} items (org: ${orgId.slice(0, 8)})`);
    } catch (e) {
      log(`GET ${path} -> ERROR`);
    }
  };

  const fetchDepts = async () => {
    try {
      const res = await apiFetch("/departments");
      const data = await res.json();
      setDepts(data);
      if (data.length > 0 && !newAssetDeptId) setNewAssetDeptId(data[0].id);
      log(`GET /departments -> ${res.status}, ${data.length} items`);
    } catch (e) {
      log(`GET /departments -> ERROR`);
    }
  };

  const createDept = async () => {
    if (!newDeptName.trim()) return;
    try {
      const res = await apiFetch("/departments", {
        method: "POST",
        body: JSON.stringify({ name: newDeptName }),
      });
      const data = await res.json();
      log(`POST /departments -> ${res.status}, id=${data.id || "N/A"}`);
      if (res.ok) {
        setNewDeptName("");
        fetchDepts();
      }
    } catch (e) {
      log(`POST /departments -> ERROR`);
    }
  };

  const fetchAssetTypes = async () => {
    try {
      const res = await apiFetch("/asset-types");
      const data = await res.json();
      setAssetTypes(data);
      if (data.length > 0 && !newAssetTypeId) setNewAssetTypeId(data[0].id);
      log(`GET /asset-types -> ${res.status}, ${data.length} items`);
    } catch (e) {
      log(`GET /asset-types -> ERROR`);
    }
  };

  const createAssetType = async () => {
    if (!newTypeName.trim()) return;
    const payload = {
      name: newTypeName,
      description: newTypeDesc,
      iconName: "server",
      fields: typeFields.map((f, i) => ({
        name: f.name,
        dataType: f.dataType,
        isRequired: f.isRequired,
        isCveSearchable: f.isCveSearchable,
        displayOrder: i,
      })),
    };
    try {
      const res = await apiFetch("/asset-types", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      log(`POST /asset-types -> ${res.status}, id=${data.id || "N/A"}`);
      if (res.ok) {
        setNewTypeName("");
        setNewTypeDesc("");
        setTypeFields([
          { name: "hostname", dataType: "text", isRequired: true, isCveSearchable: false },
          { name: "os", dataType: "text", isRequired: true, isCveSearchable: true },
          { name: "version", dataType: "text", isRequired: false, isCveSearchable: true },
        ]);
        fetchAssetTypes();
      }
    } catch (e) {
      log(`POST /asset-types -> ERROR`);
    }
  };

  const addTypeField = () => {
    setTypeFields((prev) => [...prev, { name: "", dataType: "text", isRequired: false, isCveSearchable: false }]);
  };

  const removeTypeField = (idx: number) => {
    setTypeFields((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateTypeField = (idx: number, patch: Partial<FieldDraft>) => {
    setTypeFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };

  const deleteAssetType = async (id: string) => {
    if (!confirm("Delete this asset type? Assets using it will become 'Unknown'.")) return;
    try {
      const res = await apiFetch(`/asset-types/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      log(`DELETE /asset-types/${id} -> ${res.status}, ${data.message || ""}`);
      if (res.ok) fetchAssetTypes();
    } catch (e) {
      log(`DELETE /asset-types -> ERROR`);
    }
  };

  const fetchAssets = async () => {
    try {
      const res = await apiFetch("/assets");
      const data = await res.json();
      setAssets(data);
      log(`GET /assets -> ${res.status}, ${data.length} items`);
    } catch (e) {
      log(`GET /assets -> ERROR`);
    }
  };

  const scanAsset = async (assetId: string) => {
    setScanningAsset(assetId);
    try {
      const res = await apiFetch(`/scan/assets/${assetId}`, { method: "POST" });
      const data = await res.json();
      setScanResults((prev) => ({ ...prev, [assetId]: data }));
      log(`POST /scan/assets/${assetId} -> ${res.status}, ${data.vulnerabilitiesFound} CVEs`);
      // Refresh assets to get updated risk scores
      fetchAssets();
    } catch (e) {
      log(`POST /scan/assets/${assetId} -> ERROR`);
    }
    setScanningAsset(null);
  };

  const createAsset = async () => {
    if (!newAssetName.trim() || !newAssetTypeId || !newAssetDeptId) return;
    const type = assetTypes.find((t) => t.id === newAssetTypeId);
    const properties: Record<string, any> = {};
    if (type?.fields) {
      for (const f of type.fields) {
        if (f.name === "hostname") properties[f.name] = newAssetName.toLowerCase().replace(/\s+/g, "-");
        else if (f.name === "os") properties[f.name] = "Ubuntu 22.04";
        else if (f.name === "version") properties[f.name] = "1.0.0";
        else properties[f.name] = "demo";
      }
    }
    const payload = {
      name: newAssetName,
      assetTypeId: newAssetTypeId,
      departmentId: newAssetDeptId,
      properties,
    };
    try {
      const res = await apiFetch("/assets", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      log(`POST /assets -> ${res.status}, id=${data.id || "N/A"}`);
      if (res.ok) {
        setNewAssetName("");
        fetchAssets();
      }
    } catch (e) {
      log(`POST /assets -> ERROR`);
    }
  };

  const currentOrgName = user?.organizations?.find((o) => o.organizationId === currentOrgId)?.organizationName ?? "No org selected";
  const currentOrgRole = user?.organizations?.find((o) => o.organizationId === currentOrgId)?.role ?? "";

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">VelcozSharp Dev Test Page</h1>

      {!user ? (
        <div className="space-y-4">
          <div className="border p-4 space-y-2">
            <h2 className="font-semibold">Manual Login</h2>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-2 py-1 border"
              placeholder="email"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-2 py-1 border"
              placeholder="password"
            />
            <button
              onClick={() => login(email, password)}
              disabled={loading}
              className="px-3 py-1 bg-blue-600 text-white rounded"
            >
              Login
            </button>
            {error && <div className="text-red-600 text-sm">{error}</div>}
          </div>

          <div className="border p-4 space-y-2">
            <h2 className="font-semibold">Dev Accounts</h2>
            {DEV_ACCOUNTS.map((acc) => (
              <div key={acc.email} className="flex justify-between items-center border p-2">
                <div className="text-sm">
                  <div className="font-medium">{acc.name}</div>
                  <div className="text-gray-500 text-xs">{acc.email} / {acc.password}</div>
                </div>
                <button
                  onClick={() => fillAndLogin(acc)}
                  className="px-2 py-1 bg-gray-800 text-white text-sm rounded"
                >
                  Login as {acc.role}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Session */}
          <div className="border p-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-semibold">Session: {user.email} ({user.role})</h2>
              <button onClick={logout} className="px-2 py-1 bg-red-600 text-white text-sm rounded">Logout</button>
            </div>
            <div className="text-xs space-y-1">
              <div>UserId: <span className="font-mono">{user.userId}</span></div>
              
              {/* Org Switcher */}
              {user.organizations && user.organizations.length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-gray-500">Organization:</span>
                  <select
                    value={currentOrgId}
                    onChange={(e) => switchOrg(e.target.value)}
                    className="px-2 py-1 border text-sm rounded"
                  >
                    {user.organizations.map((org) => (
                      <option key={org.organizationId} value={org.organizationId}>
                        {org.organizationName} ({org.role})
                      </option>
                    ))}
                  </select>
                  <span className="text-gray-400 text-xs">X-Organization-Id: {currentOrgId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Organizations */}
          <div className="border p-4 space-y-2">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Your Organizations</h2>
            </div>
            {user.organizations?.length === 0 ? (
              <div className="text-gray-500 text-sm">No organizations</div>
            ) : (
              <div className="space-y-1">
                {user.organizations?.map((o) => (
                  <div key={o.organizationId} className="border p-2 text-sm flex justify-between">
                    <span className="font-medium">{o.organizationName}</span>
                    <span className="text-gray-500 text-xs">{o.role} {o.isDefault && "(default)"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Departments */}
          <div className="border p-4 space-y-2">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Departments ({currentOrgName})</h2>
              <button onClick={fetchDepts} className="px-2 py-1 bg-gray-200 text-sm rounded">Fetch</button>
            </div>

            {currentOrgRole === "Admin" && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  className="flex-1 px-2 py-1 border text-sm"
                  placeholder="New department name"
                />
                <button onClick={createDept} className="px-2 py-1 bg-green-600 text-white text-sm rounded">Create</button>
              </div>
            )}

            {depts.length === 0 ? (
              <div className="text-gray-500 text-sm">No departments loaded</div>
            ) : (
              <div className="space-y-1">
                {depts.map((d) => (
                  <div key={d.id} className="border p-2 text-sm flex justify-between">
                    <span className="font-medium">{d.name}</span>
                    <span className="text-gray-500 text-xs">{d.id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Asset Types */}
          <div className="border p-4 space-y-2">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Asset Types ({currentOrgName})</h2>
              <button onClick={fetchAssetTypes} className="px-2 py-1 bg-gray-200 text-sm rounded">Fetch</button>
            </div>

            {currentOrgRole === "Admin" && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    className="flex-1 px-2 py-1 border text-sm"
                    placeholder="New asset type name"
                  />
                  <input
                    type="text"
                    value={newTypeDesc}
                    onChange={(e) => setNewTypeDesc(e.target.value)}
                    className="flex-1 px-2 py-1 border text-sm"
                    placeholder="Description"
                  />
                  <button onClick={createAssetType} className="px-2 py-1 bg-green-600 text-white text-sm rounded">Create</button>
                </div>
                <div className="space-y-1">
                  {typeFields.map((f, idx) => (
                    <div key={idx} className="flex gap-2 items-center text-sm">
                      <input
                        type="text"
                        value={f.name}
                        onChange={(e) => updateTypeField(idx, { name: e.target.value })}
                        className="flex-1 px-2 py-1 border"
                        placeholder="Field name"
                      />
                      <select
                        value={f.dataType}
                        onChange={(e) => updateTypeField(idx, { dataType: e.target.value })}
                        className="px-2 py-1 border"
                      >
                        <option value="text">text</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="date">date</option>
                      </select>
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={f.isRequired}
                          onChange={(e) => updateTypeField(idx, { isRequired: e.target.checked })}
                        />
                        Req
                      </label>
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={f.isCveSearchable}
                          onChange={(e) => updateTypeField(idx, { isCveSearchable: e.target.checked })}
                        />
                        CVE
                      </label>
                      <button onClick={() => removeTypeField(idx)} className="px-1 py-0.5 bg-red-100 text-red-700 text-xs rounded">&times;</button>
                    </div>
                  ))}
                  <button onClick={addTypeField} className="text-xs text-blue-600 hover:underline">+ Add field</button>
                </div>
              </div>
            )}

            {assetTypes.length === 0 ? (
              <div className="text-gray-500 text-sm">No asset types loaded</div>
            ) : (
              <div className="space-y-2">
                {assetTypes.map((t) => (
                  <div key={t.id} className="border p-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{t.name}</span>
                      <div className="flex gap-2">
                        <span className="text-gray-500 text-xs">{t.id}</span>
                        {currentOrgRole === "Admin" && (
                          <button onClick={() => deleteAssetType(t.id)} className="text-xs text-red-600 hover:underline">Delete</button>
                        )}
                      </div>
                    </div>
                    {t.description && <div className="text-gray-600 text-xs">{t.description}</div>}
                    {t.fields?.length > 0 && (
                      <div className="mt-1 text-xs text-gray-500">
                        Fields: {t.fields.map((f: any) => `${f.name}(${f.dataType}${f.isRequired ? '*' : ''})`).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assets */}
          <div className="border p-4 space-y-2">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Assets ({currentOrgName})</h2>
              <button onClick={fetchAssets} className="px-2 py-1 bg-gray-200 text-sm rounded">Fetch</button>
            </div>

            {currentOrgRole !== "Viewer" && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAssetName}
                    onChange={(e) => setNewAssetName(e.target.value)}
                    className="flex-1 px-2 py-1 border text-sm"
                    placeholder="New asset name"
                  />
                  <select
                    value={newAssetTypeId}
                    onChange={(e) => setNewAssetTypeId(e.target.value)}
                    className="px-2 py-1 border text-sm"
                  >
                    <option value="">Type...</option>
                    {assetTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <select
                    value={newAssetDeptId}
                    onChange={(e) => setNewAssetDeptId(e.target.value)}
                    className="px-2 py-1 border text-sm"
                  >
                    <option value="">Dept...</option>
                    {depts.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <button onClick={createAsset} className="px-2 py-1 bg-green-600 text-white text-sm rounded">Create</button>
                </div>
              </div>
            )}

            {assets.length === 0 ? (
              <div className="text-gray-500 text-sm">Click Fetch to load assets</div>
            ) : (
              <div className="space-y-2">
                {assets.map((a) => (
                  <div key={a.id} className="border p-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{a.name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => scanAsset(a.id)}
                          disabled={scanningAsset === a.id}
                          className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded hover:bg-blue-200 disabled:opacity-50"
                        >
                          {scanningAsset === a.id ? "Scanning..." : "Scan CVEs"}
                        </button>
                        <span className={`text-xs px-1 rounded ${a.status === 'Active' ? 'bg-green-100 text-green-700' : a.status === 'Retired' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>{a.status}</span>
                      </div>
                    </div>
                    <div className="text-gray-500 text-xs">
                      {a.assetTypeName} &bull; {a.departmentName}
                    </div>
                    {a.highestSeverity && (
                      <div className={`text-xs mt-1 inline-block px-1 rounded ${a.highestSeverity === 'Critical' ? 'bg-red-100 text-red-700' : a.highestSeverity === 'High' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        CVSS: {a.highestCvssScore} ({a.highestSeverity})
                      </div>
                    )}
                    {/* Scan Results */}
                    {scanResults[a.id] && scanResults[a.id].matches?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="text-xs font-medium text-gray-600">Last Scan: {scanResults[a.id].vulnerabilitiesFound} CVE(s)</div>
                        {scanResults[a.id].matches.slice(0, 3).map((m: any, idx: number) => (
                          <div key={idx} className="text-xs border-l-2 border-red-300 pl-2 py-0.5">
                            <span className="font-mono font-semibold">{m.cveId}</span>
                            <span className="text-gray-500 ml-1">({m.severity}, {m.cvssScore})</span>
                            {m.matchedKeyword && <span className="text-blue-500 ml-1">matched: {m.matchedKeyword}</span>}
                          </div>
                        ))}
                        {scanResults[a.id].matches.length > 3 && (
                          <div className="text-xs text-gray-400">+{scanResults[a.id].matches.length - 3} more</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* API Log */}
      <div className="border p-4">
        <h2 className="font-semibold mb-2">API Log</h2>
        <div className="bg-gray-900 text-green-400 text-xs p-2 h-32 overflow-y-auto font-mono">
          {apiLog.length === 0 ? "No requests yet" : apiLog.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>

      {/* Cookies */}
      <div className="border p-4">
        <h2 className="font-semibold mb-2">Cookies</h2>
        <pre className="bg-gray-900 text-green-400 text-xs p-2 overflow-x-auto">{rawCookies || "(none)"}</pre>
      </div>
    </div>
  );
}
