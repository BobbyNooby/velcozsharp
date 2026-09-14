"use client";

import { useEffect, useRef, useState } from "react";
import { useApiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const CRITICALITIES = ["Critical", "High", "Medium", "Low"];
const STATUSES = ["Active", "Retired", "Decommissioned"];

export type AssetFormValues = {
  id?: string;
  name: string;
  description?: string;
  assetTypeId?: string;
  departmentId?: string;
  status?: string;
  criticality?: string;
  isCriticalityAuto?: boolean;
  tags?: string[];
  properties?: Record<string, unknown>;
};

type AssetTypeField = {
  id: string;
  name: string;
  dataType: string;
  isRequired: boolean;
  displayOrder: number;
  defaultValue?: string | null;
};

type AssetTypeOption = {
  id: string;
  name: string;
  fields: AssetTypeField[];
};

type DepartmentOption = { id: string; name: string };

type FieldErrors = {
  name?: string;
  assetTypeId?: string;
  departmentId?: string;
  properties?: Record<string, string>;
};

export function AssetFormDialog({
  open,
  onOpenChange,
  mode,
  asset,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  asset?: AssetFormValues;
  onSaved: () => void;
}) {
  const apiFetch = useApiFetch();
  const { addToast } = useToast();
  const mountedRef = useRef(true);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [assetTypes, setAssetTypes] = useState<AssetTypeOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [assetTypeId, setAssetTypeId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [criticality, setCriticality] = useState("Medium");
  const [status, setStatus] = useState("Active");
  const [tagsText, setTagsText] = useState("");
  const [propertyValues, setPropertyValues] = useState<Record<string, string>>({});

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset the form and load asset types (with field definitions) + departments
  // on every open. Reset values are kept in locals so the fetch callback never
  // reads stale state from a previous dialog session.
  useEffect(() => {
    if (!open) return;
    const initialAssetTypeId = asset?.assetTypeId ?? "";
    setFieldErrors({});
    setFormError("");
    setOptionsError("");
    setName(asset?.name ?? "");
    setDescription(asset?.description ?? "");
    setAssetTypeId(initialAssetTypeId);
    setDepartmentId(asset?.departmentId ?? "");
    setCriticality(asset?.criticality ?? "Medium");
    setStatus(asset?.status ?? "Active");
    setTagsText((asset?.tags ?? []).join(", "));
    setPropertyValues({});

    const controller = new AbortController();
    setOptionsLoading(true);

    Promise.all([
      apiFetch("/asset-types?pageSize=100", { signal: controller.signal }),
      apiFetch("/departments?pageSize=100", { signal: controller.signal }),
    ])
      .then(async ([atRes, deptRes]) => {
        if (controller.signal.aborted || !mountedRef.current) return;
        let types: AssetTypeOption[] = [];
        let depts: DepartmentOption[] = [];
        let failed = false;
        if (atRes.ok) {
          const data = await atRes.json();
          types = data.items ?? [];
        } else {
          failed = true;
        }
        if (deptRes.ok) {
          const data = await deptRes.json();
          depts = data.items ?? [];
        } else {
          failed = true;
        }
        setAssetTypes(types);
        setDepartments(depts);
        if (failed) {
          setOptionsError("Could not load asset types or departments.");
          return;
        }
        // Seed the dynamic properties for the current asset type (edit mode),
        // or auto-select the first type in create mode (like onboarding does).
        if (mode === "create" && !initialAssetTypeId && types.length > 0) {
          setAssetTypeId(types[0].id);
          seedPropertyValues(types[0], undefined);
          return;
        }
        const currentType = types.find((t) => t.id === initialAssetTypeId);
        if (currentType) seedPropertyValues(currentType, asset?.properties);
      })
      .catch(() => {
        if (!controller.signal.aborted && mountedRef.current) {
          setOptionsError("Could not load asset types or departments.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && mountedRef.current) setOptionsLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, apiFetch]);

  // Focus the first field when the dialog opens.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => nameInputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Escape closes the dialog (the shared Dialog primitive only handles overlay clicks).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const seedPropertyValues = (type: AssetTypeOption, existing?: Record<string, unknown>) => {
    const values: Record<string, string> = {};
    for (const field of type.fields) {
      const current = existing?.[field.name];
      values[field.name] = current != null ? String(current) : (field.defaultValue ?? "");
    }
    setPropertyValues(values);
  };

  const selectedType = assetTypes.find((t) => t.id === assetTypeId);

  const handleSelectType = (id: string) => {
    setAssetTypeId(id);
    setFieldErrors((prev) => ({ ...prev, assetTypeId: undefined, properties: undefined }));
    const type = assetTypes.find((t) => t.id === id);
    if (type) seedPropertyValues(type, id === asset?.assetTypeId ? asset?.properties : undefined);
  };

  const handlePropertyChange = (fieldName: string, value: string) => {
    setPropertyValues((prev) => ({ ...prev, [fieldName]: value }));
  };

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = "Name is required.";
    if (!assetTypeId) errors.assetTypeId = "Asset type is required.";
    if (!departmentId) errors.departmentId = "Department is required.";
    const propertyErrors: Record<string, string> = {};
    for (const field of selectedType?.fields ?? []) {
      if (field.isRequired && !(propertyValues[field.name] ?? "").trim()) {
        propertyErrors[field.name] = `${field.name} is required.`;
      }
    }
    if (Object.keys(propertyErrors).length > 0) errors.properties = propertyErrors;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !validate()) return;
    setSaving(true);
    setFormError("");

    // Send only schema-defined keys (the backend rejects unknown ones) as strings;
    // the backend coerces values per the field's data type.
    const properties: Record<string, unknown> = {};
    for (const field of selectedType?.fields ?? []) {
      const value = (propertyValues[field.name] ?? "").trim();
      if (value !== "") properties[field.name] = value;
    }
    const tags = tagsText.split(",").map((t) => t.trim()).filter(Boolean);

    try {
      const res =
        mode === "create"
          ? await apiFetch("/assets", {
              method: "POST",
              body: JSON.stringify({
                name: name.trim(),
                description: description.trim() || null,
                assetTypeId,
                departmentId,
                criticality,
                tags,
                properties,
              }),
            })
          : await apiFetch(`/assets/${asset?.id}`, {
              method: "PUT",
              body: JSON.stringify({
                name: name.trim(),
                description: description.trim() || null,
                departmentId,
                status,
                criticality,
                isCriticalityAuto: asset?.isCriticalityAuto ?? true,
                tags,
                properties,
              }),
            });

      if (!mountedRef.current) return;
      if (res.ok) {
        addToast({
          title: mode === "create" ? "Asset created" : "Asset updated",
          message: name.trim(),
          variant: "success",
        });
        onSaved();
        onOpenChange(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setFormError(
          data.message ?? (mode === "create" ? "Failed to create asset." : "Failed to update asset.")
        );
      }
    } catch (err) {
      if (mountedRef.current) {
        setFormError(err instanceof Error && err.message ? err.message : "Network error. Please try again.");
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-form-dialog-title"
        className="max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle id="asset-form-dialog-title">
            {mode === "create" ? "Add Asset" : "Edit Asset"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Register a new asset to scan against the NVD."
              : "Update this asset's details and classification."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="asset-form-name">Name *</Label>
            <Input
              id="asset-form-name"
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="web-server-01"
              disabled={saving}
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-form-description">Description</Label>
            <Input
              id="asset-form-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this asset used for?"
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Asset Type *</Label>
              <Select
                value={assetTypeId}
                onValueChange={(v) => handleSelectType(v ?? "")}
                disabled={mode === "edit" || saving}
              >
                <SelectTrigger className="w-full" aria-invalid={Boolean(fieldErrors.assetTypeId)}>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {assetTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.assetTypeId && (
                <p className="text-xs text-destructive">{fieldErrors.assetTypeId}</p>
              )}
              {mode === "edit" && (
                <p className="text-xs text-muted-foreground">Asset type cannot be changed.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Department *</Label>
              <Select
                value={departmentId}
                onValueChange={(v) => {
                  setDepartmentId(v ?? "");
                  setFieldErrors((prev) => ({ ...prev, departmentId: undefined }));
                }}
                disabled={saving}
              >
                <SelectTrigger className="w-full" aria-invalid={Boolean(fieldErrors.departmentId)}>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.departmentId && (
                <p className="text-xs text-destructive">{fieldErrors.departmentId}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Criticality</Label>
              <Select
                value={criticality}
                onValueChange={(v) => setCriticality(v ?? "Medium")}
                disabled={saving}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRITICALITIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mode === "edit" && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v ?? "Active")} disabled={saving}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-form-tags">Tags</Label>
            <Input
              id="asset-form-tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="production, dmz, legacy"
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">Comma-separated.</p>
          </div>

          {/* Dynamic properties driven by the selected asset type's field definitions */}
          {selectedType && (
            <div className="space-y-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Properties</p>
                <p className="text-xs text-muted-foreground">
                  Additional fields for the &ldquo;{selectedType.name}&rdquo; asset type.
                </p>
              </div>
              {selectedType.fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">No additional properties for this type.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedType.fields.map((field) => (
                    <div key={field.id} className="space-y-1.5">
                      <Label htmlFor={`asset-form-prop-${field.id}`}>
                        {field.name}
                        {field.isRequired ? " *" : ""}
                      </Label>
                      <Input
                        id={`asset-form-prop-${field.id}`}
                        value={propertyValues[field.name] ?? ""}
                        onChange={(e) => handlePropertyChange(field.name, e.target.value)}
                        placeholder={field.defaultValue ?? undefined}
                        disabled={saving}
                        aria-invalid={Boolean(fieldErrors.properties?.[field.name])}
                      />
                      {fieldErrors.properties?.[field.name] && (
                        <p className="text-xs text-destructive">{fieldErrors.properties[field.name]}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {optionsLoading && (
            <p className="text-sm text-muted-foreground">Loading asset types and departments...</p>
          )}
          {optionsError && (
            <Alert variant="destructive">
              <AlertDescription>{optionsError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-1 size-4 animate-spin" />}
              {mode === "create" ? "Create Asset" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
