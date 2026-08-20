"use client"

import { useEffect } from 'react'
import { useStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { initializeOfflineMode } from '@/lib/offline-init'
import { OfflineIndicator } from '@/components/offline-indicator'

interface DataProviderProps {
  children: React.ReactNode
}

export function DataProvider({ children }: DataProviderProps) {
  const { fetchProducts, fetchCategories, fetchCustomers } = useStore()
  const { toast } = useToast()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    const initializeData = async () => {
      try {
        await initializeOfflineMode()
      } catch (error) {
        console.log('Offline init skipped:', error)
      }

      const results = await Promise.allSettled([
        fetchProducts({ force: true }),
        fetchCategories(true),
        fetchCustomers(true),
      ])

      const failed = results.filter((r) => r.status === 'rejected')
      if (failed.length === 0) {
        console.log('✅ All data initialized successfully')
        return
      }

      failed.forEach((r) =>
        console.log('Background data fetch failed:', r.status === 'rejected' ? r.reason : r),
      )

      // Supplier/POS pages can still work — only warn when everything failed while online.
      if (navigator.onLine && failed.length === results.length) {
        toast({
          variant: 'destructive',
          title: 'Data Loading Error',
          description: 'Some data failed to load. Please refresh the page.',
        })
      }
    }

    initializeData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      {children}
      <OfflineIndicator />
    </>
  )
}
