/**
 * UUID generuje KLIENT, nie baza — `id` jest częścią kontraktu sync
 * (backend/API.md: „`id` może pochodzić z klienta"). Dzięki temu wiersz serii
 * ma swoją tożsamość, zanim serwer o nim usłyszy, a `PUT .../sets/{id}` jest
 * upsertem, czyli ponowienie po utracie sieci nie tworzy duplikatu.
 */
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Środowiska bez Web Crypto (stary WebView, node w testach) — wariant 4
  // wygenerowany z getRandomValues albo, w ostateczności, z Math.random.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
