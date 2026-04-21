'use client'

import { useEffect } from 'react'

export default function StickerAutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 350)
    return () => clearTimeout(t)
  }, [])
  return null
}
