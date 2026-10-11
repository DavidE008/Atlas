export const MISSION_ATTACHMENT_BUCKET = "mission-references";
export const MAX_MISSION_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024;

const FILE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const MISSION_ATTACHMENT_ACCEPT = Object.keys(FILE_TYPES)
  .map((extension) => `.${extension}`)
  .join(",");

export function attachmentContentType(name: string) {
  return FILE_TYPES[name.split(".").pop()?.toLowerCase() ?? ""];
}

export function validateMissionAttachments(files: readonly Pick<File, "name" | "size">[]) {
  if (files.length > MAX_MISSION_ATTACHMENTS) throw new Error("Add up to 5 reference files.");
  for (const file of files) {
    if (!attachmentContentType(file.name))
      throw new Error("Use images, PDF, TXT, CSV, DOCX, or XLSX reference files.");
    if (file.name.length > 200) throw new Error("File names must be 200 characters or fewer.");
    if (!file.size || file.size > MAX_ATTACHMENT_BYTES)
      throw new Error(`${file.name}: files must be nonempty and no larger than 10 MB.`);
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_ATTACHMENT_TOTAL_BYTES)
    throw new Error("Reference files must total 25 MB or less.");
}

export function attachmentSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
