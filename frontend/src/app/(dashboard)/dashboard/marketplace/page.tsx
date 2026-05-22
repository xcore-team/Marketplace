"use client"

import { useState } from "react"
import PluginBrowser from "@/components/plugin/PluginBrowser"
import PluginDetailsModal from "@/components/plugin/PluginDetailsModal"
import type { PublicPlugin } from "@/types/plugin"

export default function DashboardMarketplacePage() {
  const [selected, setSelected]             = useState<PublicPlugin | null>(null)
  const [modalOpen, setModalOpen]           = useState(false)

  function openDetails(plugin: PublicPlugin) { setSelected(plugin); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setTimeout(() => setSelected(null), 300) }

  return (
    <div className="min-h-full bg-background pt-4">
      <PluginBrowser onOpenDetails={openDetails} />

      <PluginDetailsModal
        plugin={selected}
        isOpen={modalOpen}
        onClose={closeModal}
      />
    </div>
  )
}
