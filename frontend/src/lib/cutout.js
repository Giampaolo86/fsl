const MAX = 1400;

const downscale = (file) => new Promise((resolve) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const k = Math.min(1, MAX / Math.max(img.width, img.height));
    if (k === 1) return resolve(file);
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((b) => resolve(b || file), "image/jpeg", 0.92);
  };
  img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
  img.src = url;
});

let mod;
const lib = async () => (mod ||= await import("@imgly/background-removal"));

export async function preloadCutout() {
  try { const { preload } = await lib(); await preload({ model: "isnet_quint8" }); } catch { /* offline o CDN non raggiungibile */ }
}

// Foto → PNG scontornato nel browser. In caso di errore restituisce il file originale (il server ritaglia quadrato).
export async function cutoutPhoto(file, onProgress) {
  if (!file?.type?.startsWith("image/")) return file;
  try {
    const { removeBackground } = await lib();
    const src = await downscale(file);
    const blob = await removeBackground(src, {
      model: "isnet_quint8",
      output: { format: "image/png", quality: 1 },
      progress: (key, cur, tot) => { if (key.startsWith("fetch:") && tot) onProgress?.("download", Math.round((cur / tot) * 100)); else onProgress?.("compute", null); },
    });
    onProgress?.("done", 100);
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" });
  } catch (e) {
    console.warn("Scontorno nel browser non riuscito, carico l'originale", e);
    return file;
  }
}
