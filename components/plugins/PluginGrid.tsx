'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { PluginCard, Plugin } from './PluginCard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Mock data - À remplacer par des vraies données API
const mockPlugins: Plugin[] = [
  {
    id: '1',
    name: 'Auth Manager',
    slug: 'auth-manager',
    description: 'Complete authentication and authorization system with JWT support',
    version: '2.1.0',
    author: 'XCore Team',
    downloads: 15420,
    rating: 4.8,
    category: 'Security',
    trustLevel: 'core',
    trending: true,
    featured: true,
  },
  {
    id: '2',
    name: 'Database Connector',
    slug: 'database-connector',
    description: 'Universal database connector supporting PostgreSQL, MySQL, MongoDB',
    version: '1.5.2',
    author: 'DataTeam',
    downloads: 12350,
    rating: 4.6,
    category: 'Database',
    trustLevel: 'trusted',
    trending: true,
  },
  {
    id: '3',
    name: 'API Gateway',
    slug: 'api-gateway',
    description: 'High-performance API gateway with rate limiting and caching',
    version: '3.0.1',
    author: 'NetworkLabs',
    downloads: 9870,
    rating: 4.9,
    category: 'Networking',
    trustLevel: 'verified',
  },
  {
    id: '4',
    name: 'Logger Pro',
    slug: 'logger-pro',
    description: 'Advanced logging system with multiple outputs and formatters',
    version: '1.2.0',
    author: 'DevTools',
    downloads: 8540,
    rating: 4.5,
    category: 'Development',
    trustLevel: 'verified',
  },
  {
    id: '5',
    name: 'Cache Manager',
    slug: 'cache-manager',
    description: 'Flexible caching solution with Redis and Memcached support',
    version: '2.3.1',
    author: 'PerformanceTeam',
    downloads: 7230,
    rating: 4.7,
    category: 'Performance',
    trustLevel: 'trusted',
  },
  {
    id: '6',
    name: 'Email Service',
    slug: 'email-service',
    description: 'Send emails with templates, attachments, and scheduling',
    version: '1.8.0',
    author: 'CommTeam',
    downloads: 6890,
    rating: 4.4,
    category: 'Communication',
    trustLevel: 'verified',
  },
  {
    id: '7',
    name: 'File Storage',
    slug: 'file-storage',
    description: 'Cloud storage integration for AWS S3, Azure, and Google Cloud',
    version: '2.0.0',
    author: 'CloudOps',
    downloads: 5670,
    rating: 4.6,
    category: 'Storage',
    trustLevel: 'trusted',
  },
  {
    id: '8',
    name: 'Task Scheduler',
    slug: 'task-scheduler',
    description: 'Cron-like task scheduler with distributed execution support',
    version: '1.4.2',
    author: 'AutomationLabs',
    downloads: 4320,
    rating: 4.3,
    category: 'Automation',
    trustLevel: 'verified',
  },
]

export function PluginGrid() {
  const t = useTranslations()
  const [activeTab, setActiveTab] = useState('featured')

  const featuredPlugins = mockPlugins.filter((p) => p.featured)
  const popularPlugins = [...mockPlugins].sort((a, b) => b.downloads - a.downloads)
  const newPlugins = [...mockPlugins].reverse()

  return (
    <div className="space-y-8">
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-xcore-card border border-xcore-border">
          <TabsTrigger value="featured" className="data-[state=active]:bg-xcore-green/10 data-[state=active]:text-xcore-green">
            {t('plugins.featured')}
          </TabsTrigger>
          <TabsTrigger value="popular" className="data-[state=active]:bg-xcore-green/10 data-[state=active]:text-xcore-green">
            {t('plugins.popular')}
          </TabsTrigger>
          <TabsTrigger value="new" className="data-[state=active]:bg-xcore-green/10 data-[state=active]:text-xcore-green">
            {t('plugins.new')}
          </TabsTrigger>
        </TabsList>

        {/* Featured */}
        <TabsContent value="featured" className="mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredPlugins.map((plugin) => (
              <PluginCard key={plugin.id} plugin={plugin} />
            ))}
          </div>
        </TabsContent>

        {/* Popular */}
        <TabsContent value="popular" className="mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {popularPlugins.map((plugin) => (
              <PluginCard key={plugin.id} plugin={plugin} />
            ))}
          </div>
        </TabsContent>

        {/* New */}
        <TabsContent value="new" className="mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {newPlugins.map((plugin) => (
              <PluginCard key={plugin.id} plugin={plugin} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
