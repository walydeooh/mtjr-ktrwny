import { useRef, useState } from "react";
import { useUpload } from "@workspace/object-storage-web";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Link as LinkIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "url" | "upload";

interface MediaPickerProps {
  value: string;
  onChange: (value: string) => void;
  accept?: string;
  placeholder?: string;
  previewKind?: "image" | "video" | "auto";
  className?: string;
  disabled?: boolean;
}

/**
 * Unified picker for any media URL field across the admin UI.
 * Lets the user either paste a URL or upload a file from their device.
 * Uploaded files go through the project's object storage and the resulting
 * served URL is written back via onChange — exactly what every form already
 * stores in the DB, so swapping <Input> for this is a drop-in replacement.
 */
export function MediaPicker({
  value,
  onChange,
  accept = "image/*",
  placeholder = "https://example.com/image.jpg",
  previewKind = "auto",
  className,
  disabled,
}: MediaPickerProps) {
  const [mode, setMode] = useState<Mode>("url");
  const fileRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading, progress, error } = useUpload({
    onSuccess: (res) => {
      // The presigned upload returns a path like "/objects/uploads/<id>".
      // Our serving route is mounted at /api/storage, so the public-readable
      // URL we store is /api/storage + objectPath.
      onChange(`/api/storage${res.objectPath}`);
    },
  });

  const isVideo =
    previewKind === "video" ||
    (previewKind === "auto" && /\.(mp4|webm|mov)$/i.test(value));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === "url" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("url")}
          disabled={disabled}
        >
          <LinkIcon className="ms-1 h-4 w-4" />
          رابط
        </Button>
        <Button
          type="button"
          variant={mode === "upload" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("upload")}
          disabled={disabled}
        >
          <Upload className="ms-1 h-4 w-4" />
          رفع ملف
        </Button>
      </div>

      {mode === "url" ? (
        <Input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      ) : (
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="hidden"
            disabled={disabled || isUploading}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await uploadFile(f);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="ms-2 h-4 w-4 animate-spin" />
                جاري الرفع... {progress}%
              </>
            ) : (
              <>
                <Upload className="ms-2 h-4 w-4" />
                اختر ملفاً من جهازك
              </>
            )}
          </Button>
          {error && (
            <p className="text-xs text-destructive">فشل الرفع: {error.message}</p>
          )}
        </div>
      )}

      {value && (
        <div className="relative inline-block">
          {isVideo ? (
            <video
              src={value}
              controls
              className="max-h-32 rounded border"
            />
          ) : (
            <img
              src={value}
              alt="معاينة"
              className="max-h-32 rounded border object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute -top-2 -end-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow"
              aria-label="إزالة"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
