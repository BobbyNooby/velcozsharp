"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ExportButton({ basePath, params }: { basePath: string; params?: Record<string, string> }) {
  const [format, setFormat] = useState("csv");

  const download = () => {
    const searchParams = new URLSearchParams(params ?? {});
    searchParams.set("format", format);
    const url = `http://localhost:5038/api${basePath}?${searchParams.toString()}`;
    window.open(url, "_blank");
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={format} onValueChange={(v) => setFormat(v ?? "csv")}>
        <SelectTrigger className="w-[100px] h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="csv">CSV</SelectItem>
          <SelectItem value="json">JSON</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={download}>
        Export
      </Button>
    </div>
  );
}
