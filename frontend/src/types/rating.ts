export interface Rating {
  id?: string
  score: number
  comment?: string | null
  created_at?: string
  updated_at?: string
  user_id?: string
}

export interface PluginRatingsSummary {
  average: number | null
  count: number
  myRating: number | null
}
