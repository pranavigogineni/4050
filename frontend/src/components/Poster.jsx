import { useState } from 'react'

export default function Poster({ src, alt, ...props }) {
  const [failedSource, setFailedSource] = useState(null)
  return <img {...props} src={failedSource === src ? '/poster-placeholder.svg' : src}
    alt={alt} onError={() => setFailedSource(src)} />
}
