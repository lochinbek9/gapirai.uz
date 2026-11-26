import { apiClient } from '@/lib/api'

export interface BrainIdea {
  key: string
  title: string
  description: string
  /** Videoda soniya, hujjatda bet raqami */
  timestamp: number | null
  selected: boolean
  hidden: boolean
  note: string
  tags: string[]
}

export interface BrainAnalysis {
  analysis_id: string
  source_type: 'video' | 'document'
  video_id: string | null
  url: string | null
  title: string | null
  thumbnail: string | null
  duration: number | null
  pages: number | null
  video_language: string | null
  language: string | null
  created_at: string | null
  summary: string
  chapters_count: number
  channel: { name: string; url: string | null } | null
  ideas: BrainIdea[]
}

export type IdeaPatch = Partial<Pick<BrainIdea, 'selected' | 'hidden' | 'note' | 'tags'>>

export async function getBrainAccess(): Promise<boolean> {
  const res = await apiClient.get('/api/brain/access')
  return !!res.data?.allowed
}

export async function getBrain(): Promise<BrainAnalysis[]> {
  const res = await apiClient.get('/api/brain')
  return res.data.analyses
}

export async function updateBrainIdea(analysisId: string, key: string, patch: IdeaPatch): Promise<Required<IdeaPatch>> {
  const res = await apiClient.put(`/api/brain/ideas/${analysisId}/${key}`, patch)
  return res.data
}

/** Tahlilning barcha fikrlarini tanlaydi; vazifalar fonda yaratiladi */
export async function selectAllIdeas(analysisId: string): Promise<{ selected: string[]; started: number }> {
  const res = await apiClient.post(`/api/brain/analyses/${analysisId}/select-all`)
  return res.data
}

/* ── Vazifalar va kanban ───────────────────────────────── */

export interface ChecklistItem { text: string; done: boolean }

export interface BrainTask {
  id: string
  analysis_id: string | null
  idea_key: string | null
  idea_title: string | null
  analysis_title: string | null
  video_id: string | null
  timestamp: number | null
  title: string
  description: string
  ai_model: string | null
  /** null -- tahrirlanmagan */
  version: 'original' | 'edited' | null
  /** null -- hali qabul qilinmagan taklif */
  column_id: string | null
  position: number
  due_date: string | null
  duration_minutes: number | null
  labels: string[]
  checklist: ChecklistItem[]
  /** null emas -- arxivda */
  archived_at: string | null
}

export interface BrainBoard {
  columns: { id: string; title: string }[]
  tasks: BrainTask[]
  generations: { analysis_id: string; idea_key: string; status: 'pending' | 'done' | 'failed' }[]
}

export type TaskPatch = Partial<Pick<BrainTask, 'title' | 'description' | 'due_date' | 'duration_minutes' | 'labels' | 'checklist'>>

export const getBoard = async (): Promise<BrainBoard> => (await apiClient.get('/api/brain/tasks')).data
export const createTask = (title: string, columnId: string) => apiClient.post('/api/brain/tasks', { title, column_id: columnId })
export const updateTask = (id: string, patch: TaskPatch) => apiClient.patch(`/api/brain/tasks/${id}`, patch)
export const switchTaskVersion = async (id: string, version: 'original' | 'edited'): Promise<BrainTask> =>
  (await apiClient.post(`/api/brain/tasks/${id}/version`, { version })).data
export const moveTask = (id: string, columnId: string | null, index?: number) =>
  apiClient.post(`/api/brain/tasks/${id}/move`, { column_id: columnId, index })
export const archiveTask = (id: string) => apiClient.post(`/api/brain/tasks/${id}/archive`)
export const restoreTask = (id: string) => apiClient.post(`/api/brain/tasks/${id}/restore`)
/** Faqat arxivdagi vazifa uchun: ro'yxatdan butunlay yo'qoladi */
export const deleteTask = (id: string) => apiClient.delete(`/api/brain/tasks/${id}`)
export const retryGeneration = (analysisId: string, key: string) => apiClient.post(`/api/brain/ideas/${analysisId}/${key}/generate`)
export const createColumn = (title: string) => apiClient.post('/api/brain/columns', { title })
export const updateColumn = (id: string, patch: { title?: string; index?: number }) => apiClient.patch(`/api/brain/columns/${id}`, patch)
export const deleteColumn = (id: string) => apiClient.delete(`/api/brain/columns/${id}`)
