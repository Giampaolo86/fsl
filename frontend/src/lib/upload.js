import { api } from "@/lib/api";

const CHUNK = 4 * 1024 * 1024;

export async function uploadMedia(tournamentId, file, onProgress) {
  const total = Math.max(1, Math.ceil(file.size / CHUNK));
  const type = file.type || "application/octet-stream";
  const { data: init } = await api.post(`/tournaments/${tournamentId}/media/uploads`, { filename: file.name, content_type: type, size: file.size, total_chunks: total });
  for (let i = 0; i < total; i++) {
    const blob = file.slice(i * CHUNK, Math.min(file.size, (i + 1) * CHUNK));
    await api.put(`/tournaments/${tournamentId}/media/uploads/${init.upload_id}/${i}`, blob, { headers: { "Content-Type": "application/octet-stream" } });
    onProgress?.(Math.round(((i + 1) / total) * 100), i + 1, total);
  }
  const { data } = await api.post(`/tournaments/${tournamentId}/media/uploads/${init.upload_id}/complete`);
  return data;
}

export const mediaUrl = (u) => (u && u.startsWith("/api/") ? `${process.env.REACT_APP_BACKEND_URL}${u}` : u);
