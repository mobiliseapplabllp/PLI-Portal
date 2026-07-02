"use client";

import { useEffect, useState } from "react";
import { apiBlob } from "@/lib/api";

/** <img> that fetches through the API with the bearer token. */
export default function AuthImage({
  path,
  alt,
  className,
}: {
  path: string;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    setSrc(null);
    setFailed(false);
    apiBlob(path)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => setFailed(true));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);

  if (failed)
    return (
      <div className={`grid place-items-center bg-slate-200 text-xs text-slate-500 dark:bg-slate-800 ${className}`}>
        unavailable
      </div>
    );
  if (!src)
    return <div className={`animate-pulse bg-slate-200 dark:bg-slate-800 ${className}`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}
