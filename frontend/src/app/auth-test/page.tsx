"use client";

import { useState, useEffect } from "react";

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
  organizationId: string;
  organizationName: string;
};

export default function AuthTestPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rawCookies, setRawCookies] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Phase 3 data
  const [orgs, setOrgs] = useState<any[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [newDeptName, setNewDeptName] = useState("");

  // Phase 4 data
  const [assetTypes, setAssetTypes] = useState<any[]>([]);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeDesc, setNewTypeDesc] = useState("");

  // Phase 5 data
  const [assets, setAssets] = useState<any[]>([]);
  const [newAssetName, setNewAssetName] = useState("");

  const [apiLog, setApiLog] = useState<string[]>([]);

  const log = (msg: string) => setApiLog((prev) => [...prev.slice(-19), msg]);

  const fetchMe = async () => {
    try {
      const res = await fetch(`${API}/auth/me`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setError("");
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
    setRawCookies(document.cookie);
  };

  useEffect(() => {
    fetchMe();
  }, []);

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
    setOrgs([]);
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

  // Phase 3 fetchers
  const fetchOrgs = async () => {
    try {
      const res = await fetch(`${API}/organizations`, { credentials: "include" });
      const data = await res.json();
      setOrgs(data);
      log(`GET /organizations -> ${res.status}, ${data.length} items`);
    } catch (e) {
      log(`GET /organizations -> ERROR`);
    }
  };

  const fetchDepts = async () => {
    try {
      const res = await fetch(`${API}/departments`, { credentials: "include" });
      const data = await res.json();
      setDepts(data);
      log(`GET /departments -> ${res.status}, ${data.length} items`);
    } catch (e) {
      log(`GET /departments -> ERROR`);
    }
  };

  const createDept = async () => {
    if (!newDeptName.trim()) return;
    try {
      const res = await fetch(`${API}/departments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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

  // Phase 4 fetchers
  const fetchAssetTypes = async () => {
    try {
      const res = await fetch(`${API}/asset-types`, { credentials: "include" });
      const data = await res.json();
      setAssetTypes(data);
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
      fields: [
        { name: "hostname", dataType: "text", isRequired: true, isCveSearchable: false, displayOrder: 0 },
        { name: "os", dataType: "text", isRequired: true, isCveSearchable: true, displayOrder: 1 },
        { name: "version", dataType: "text", isRequired: false, isCveSearchable: true, displayOrder: 2 },
      ],
    };
    try {
      const res = await fetch(`${API}/asset-types`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      log(`POST /asset-types -> ${res.status}, id=${data.id || "N/A"}`);
      if (res.ok) {
        setNewTypeName("");
        setNewTypeDesc("");
        fetchAssetTypes();
      }
    } catch (e) {
      log(`POST /asset-types -> ERROR`);
    }
  };

  // Phase 5 fetchers
  const fetchAssets = async () => {
    try {
      const res = await fetch(`${API}/assets`, { credentials: "include" });
      const data = await res.json();
      setAssets(data);
      log(`GET /assets -> ${res.status}, ${data.length} items`);
    } catch (e) {
      log(`GET /assets -> ERROR`);
    }
  };

  const createAsset = async () => {
    if (!newAssetName.trim() || assetTypes.length === 0 || depts.length === 0) return;
    const type = assetTypes[0];
    const dept = depts[0];
    const payload = {
      name: newAssetName,
      assetTypeId: type.id,
      departmentId: dept.id,
      properties: {
        hostname: newAssetName.toLowerCase().replace(/\s+/g, "-"),
        os: "Ubuntu 22.04",
        version: "1.0.0",
      },
    };
    try {
      const res = await fetch(`${API}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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
              <div>Org: {user.organizationName} ({user.organizationId})</div>
            </div>
          </div>

          {/* Organizations */}
          <div className="border p-4 space-y-2">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Organizations</h2>
              <button onClick={fetchOrgs} className="px-2 py-1 bg-gray-200 text-sm rounded">Fetch</button>
            </div>
            {orgs.length === 0 ? (
              <div className="text-gray-500 text-sm">Click Fetch to load</div>
            ) : (
              <div className="space-y-1">
                {orgs.map((o) => (
                  <div key={o.id} className="border p-2 text-sm">
                    <span className="font-medium">{o.name}</span>
                    <span className="text-gray-500 text-xs ml-2">{o.id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Departments */}
          <div className="border p-4 space-y-2">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Departments</h2>
              <button onClick={fetchDepts} className="px-2 py-1 bg-gray-200 text-sm rounded">Fetch</button>
            </div>

            {user.role === "Admin" && (
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
              <div className="text-gray-500 text-sm">Click Fetch to load</div>
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
              <h2 className="font-semibold">Asset Types</h2>
              <button onClick={fetchAssetTypes} className="px-2 py-1 bg-gray-200 text-sm rounded">Fetch</button>
            </div>

            {user.role === "Admin" && (
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
            )}

            {assetTypes.length === 0 ? (
              <div className="text-gray-500 text-sm">Click Fetch to load</div>
            ) : (
              <div className="space-y-2">
                {assetTypes.map((t) => (
                  <div key={t.id} className="border p-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{t.name}</span>
                      <span className="text-gray-500 text-xs">{t.id}</span>
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
              <h2 className="font-semibold">Assets</h2>
              <button onClick={fetchAssets} className="px-2 py-1 bg-gray-200 text-sm rounded">Fetch</button>
            </div>

            {user.role !== "Viewer" && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newAssetName}
                  onChange={(e) => setNewAssetName(e.target.value)}
                  className="flex-1 px-2 py-1 border text-sm"
                  placeholder="New asset name"
                />
                <button onClick={createAsset} className="px-2 py-1 bg-green-600 text-white text-sm rounded">Create</button>
              </div>
            )}

            {assets.length === 0 ? (
              <div className="text-gray-500 text-sm">Click Fetch to load</div>
            ) : (
              <div className="space-y-2">
                {assets.map((a) => (
                  <div key={a.id} className="border p-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{a.name}</span>
                      <span className={`text-xs px-1 rounded ${a.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{a.status}</span>
                    </div>
                    <div className="text-gray-500 text-xs">
                      {a.assetTypeName} &bull; {a.departmentName}
                    </div>
                    {a.highestSeverity && (
                      <div className={`text-xs mt-1 inline-block px-1 rounded ${a.highestSeverity === 'Critical' ? 'bg-red-100 text-red-700' : a.highestSeverity === 'High' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        CVSS: {a.highestCvssScore} ({a.highestSeverity})
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
