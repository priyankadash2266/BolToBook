import { useEffect, useState } from 'react';
import { api } from '@/data/api';
import type { CoverSpec } from '@/data/types';
import { CoverArt } from '@/components/CoverArt';
import type { CoverText } from './Previews';

/** Object URL for a stored image; revoked when the component goes away. */
export function useMediaUrl(id?: string) {
  const [url, setUrl] = useState<string>();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!id) { setUrl(undefined); setMissing(true); return; }
    let u: string | undefined;
    let alive = true;
    setMissing(false);
    api.media.get(id).then((m) => {
      if (!alive) return;
      if (!m) { setMissing(true); return; }
      u = URL.createObjectURL(m.blob);
      setUrl(u);
    }).catch(() => alive && setMissing(true));
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return { url, missing };
}

/**
 * A generated cover: the stored PNG when it's there, otherwise the same design drawn live from its spec
 * (while the image loads, or if the stored image was removed).
 */
export function CoverImage({ mediaId, spec, text, alt, className = '' }: { mediaId?: string; spec: CoverSpec; text: CoverText; alt: string; className?: string }) {
  const { url } = useMediaUrl(mediaId);
  return (
    <span className={`c2-img ${className}`}>
      {url ? <img src={url} alt={alt} width={600} height={900} decoding="async" />
        : <CoverArt title={text.title || ' '} subtitle={text.subtitle} author={text.author} spec={spec} width={300} deva={text.deva} />}
    </span>
  );
}
